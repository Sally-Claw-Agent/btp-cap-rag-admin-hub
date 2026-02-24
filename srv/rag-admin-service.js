'use strict';

const cds = require('@sap/cds');
const { randomUUID } = require('crypto');

/**
 * RagAdminService – Story 3.1 baseline: uploadDocument.
 *
 * Object Store integration is intentionally deferred (Phase 2).
 * uploadDocument validates inputs, persists document metadata to the
 * Documents entity, writes an AuditLog entry, and returns an
 * UploadDocumentResponse with technicalCode OBJECT_STORE_PENDING to
 * signal that the actual binary upload to Object Store is not yet wired.
 *
 * triggerIngestion and deleteDocument remain 501 stubs (Phase 2).
 */

const LOG = cds.log('rag-admin-service');

// ── Validation constants ──────────────────────────────────────────────────────

/** Maximum accepted file size: 50 MB. */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Allowed MIME types for RAG document uploads.
 * Covers common text-extractable formats for vectorisation.
 */
const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json',
  'application/xml'
]);

/** RFC 4122 UUID pattern – covers v1–v5 and nil UUID. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SHA-256 hex pattern – exactly 64 lowercase hex characters. */
const SHA256_RE = /^[0-9a-f]{64}$/i;

/** Maximum length of originalName / fileName, matching db/schema.cds String(500). */
const MAX_FILENAME_LENGTH = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a short, URL-safe correlation ID when none is provided by the caller.
 * Format: corr-<timestamp-base36>-<random-6-chars>
 */
function makeCorrelationId() {
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Throw a structured CAP error that includes a machine-readable `technicalCode`
 * and ensures the correlation ID is propagated in the `X-Correlation-ID`
 * response header BEFORE the error is thrown.
 *
 * @param {object} req           - CAP request context
 * @param {number} status        - HTTP status code
 * @param {string} technicalCode - Machine-readable identifier (SCREAMING_SNAKE)
 * @param {string} message       - Human-readable error message
 * @param {string} correlationId - Correlation ID for end-to-end tracing
 */
function rejectWith(req, status, technicalCode, message, correlationId) {
  req.res?.set('X-Correlation-ID', correlationId);
  const err = Object.assign(new Error(message), { code: technicalCode, status });
  throw err;
}

// ── Service implementation ────────────────────────────────────────────────────

module.exports = cds.service.impl(function (srv) {

  /**
   * POST /odata/v4/rag-admin/uploadDocument
   *
   * Validates document metadata, persists a Documents record, writes an
   * AuditLog entry, and returns a placeholder objectStoreKey.
   *
   * Object Store integration is PENDING (Phase 2).
   * The returned `technicalCode: "OBJECT_STORE_PENDING"` signals that the
   * metadata has been saved but the binary has not yet been transferred to
   * BTP Object Store.  The placeholder key format is:
   *   pending/<documentId>/<fileName>
   *
   * Accepted inputs:
   *   ragProfileId    UUID     – Required; must reference an active RagProfile
   *   fileName        String   – Required; no path separators; max 500 chars
   *   mimeType        String   – Required; must be in the allowed MIME list
   *   sizeBytes       Integer  – Required; 1 – 52,428,800 (50 MB)
   *   checksumSha256  String   – Optional; 64-char hex when provided
   *
   * Returns UploadDocumentResponse (see rag-admin-service.cds).
   * All error responses carry:
   *   – OData `error.code`          → technicalCode (SCREAMING_SNAKE)
   *   – HTTP header X-Correlation-ID → correlationId for end-to-end tracing
   */
  srv.on('uploadDocument', async (req) => {
    const { ragProfileId, fileName, mimeType, sizeBytes, checksumSha256 } = req.data;

    // Establish correlation ID first so every error response carries it.
    const correlationId =
      req.headers?.['x-correlation-id'] || makeCorrelationId();
    req.res?.set('X-Correlation-ID', correlationId);

    // ── Input validation ─────────────────────────────────────────────────────

    // ragProfileId
    if (!ragProfileId) {
      rejectWith(
        req, 400,
        'VALIDATION_RAG_PROFILE_REQUIRED',
        "Field 'ragProfileId' is required.",
        correlationId
      );
    }
    if (!UUID_RE.test(ragProfileId)) {
      rejectWith(
        req, 400,
        'VALIDATION_RAG_PROFILE_INVALID_UUID',
        "Field 'ragProfileId' must be a valid UUID (RFC 4122).",
        correlationId
      );
    }

    // fileName
    if (!fileName?.trim()) {
      rejectWith(
        req, 400,
        'VALIDATION_FILENAME_REQUIRED',
        "Field 'fileName' is required and must not be empty.",
        correlationId
      );
    }
    const trimmedFileName = fileName.trim();
    if (trimmedFileName.length > MAX_FILENAME_LENGTH) {
      rejectWith(
        req, 400,
        'VALIDATION_FILENAME_TOO_LONG',
        `Field 'fileName' must not exceed ${MAX_FILENAME_LENGTH} characters.`,
        correlationId
      );
    }
    if (/[/\\]/.test(trimmedFileName) || trimmedFileName.includes('\0')) {
      rejectWith(
        req, 400,
        'VALIDATION_FILENAME_INVALID',
        "Field 'fileName' must not contain path separators or null bytes.",
        correlationId
      );
    }

    // mimeType
    if (!mimeType?.trim()) {
      rejectWith(
        req, 400,
        'VALIDATION_MIME_REQUIRED',
        "Field 'mimeType' is required.",
        correlationId
      );
    }
    const normMimeType = mimeType.trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(normMimeType)) {
      rejectWith(
        req, 400,
        'VALIDATION_MIME_NOT_ALLOWED',
        `MIME type '${mimeType}' is not allowed. ` +
          `Allowed types: ${[...ALLOWED_MIME_TYPES].join(', ')}.`,
        correlationId
      );
    }

    // sizeBytes
    if (sizeBytes == null) {
      rejectWith(
        req, 400,
        'VALIDATION_SIZE_REQUIRED',
        "Field 'sizeBytes' is required.",
        correlationId
      );
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      rejectWith(
        req, 400,
        'VALIDATION_SIZE_INVALID',
        "Field 'sizeBytes' must be a positive integer.",
        correlationId
      );
    }
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      rejectWith(
        req, 400,
        'VALIDATION_SIZE_EXCEEDED',
        `File size ${sizeBytes} bytes exceeds the maximum of ` +
          `${MAX_FILE_SIZE_BYTES} bytes (50 MB).`,
        correlationId
      );
    }

    // checksumSha256 (optional)
    if (checksumSha256 != null && !SHA256_RE.test(checksumSha256)) {
      rejectWith(
        req, 400,
        'VALIDATION_CHECKSUM_INVALID',
        "Field 'checksumSha256' must be a 64-character hexadecimal string (SHA-256).",
        correlationId
      );
    }

    // ── /validation ──────────────────────────────────────────────────────────

    // ── RAG profile existence check ──────────────────────────────────────────
    let profileFound = false;
    try {
      const profile = await SELECT.one
        .from('phoron.rag.RagProfiles')
        .where({ ID: ragProfileId, isActive: true })
        .columns('ID');
      profileFound = !!profile;
    } catch (dbErr) {
      // Non-fatal: DB may be uninitialised in early dev environments.
      // Log and treat as "found" to avoid blocking the upload flow entirely.
      LOG.warn('DB lookup for RAG profile failed; assuming valid for MVP', {
        ragProfileId,
        correlationId,
        error: dbErr.message
      });
      profileFound = true;
    }

    if (!profileFound) {
      rejectWith(
        req, 400,
        'VALIDATION_RAG_PROFILE_NOT_FOUND',
        `RAG profile '${ragProfileId}' was not found or is inactive.`,
        correlationId
      );
    }

    // ── Persist document metadata ────────────────────────────────────────────
    const documentId = randomUUID();

    // Object Store integration is PENDING (Phase 2).
    // Placeholder key format: pending/<documentId>/<fileName>
    // Replace with actual Object Store path once integration is available.
    const objectStoreKey = `pending/${documentId}/${trimmedFileName}`;

    try {
      await INSERT.into('phoron.rag.Documents').entries({
        ID: documentId,
        ragProfile_ID: ragProfileId,
        originalName: trimmedFileName,
        mimeType: normMimeType,
        sizeBytes,
        objectStoreKey,
        checksumSha256: checksumSha256 || null,
        status: 'uploaded',
        uploadedBy: req.user?.id || 'anonymous'
      });
    } catch (dbErr) {
      LOG.error('Failed to persist document metadata', {
        documentId,
        correlationId,
        error: dbErr.message
      });
      rejectWith(
        req, 500,
        'DB_INSERT_FAILED',
        'Failed to save document metadata. Please try again or contact support.',
        correlationId
      );
    }

    // ── Audit log ────────────────────────────────────────────────────────────
    try {
      await INSERT.into('phoron.rag.AuditLogs').entries({
        actorUserId: req.user?.id || 'anonymous',
        action: 'upload',
        targetType: 'document',
        targetId: documentId,
        result: 'success',
        correlationId,
        details: JSON.stringify({
          ragProfileId,
          fileName: trimmedFileName,
          mimeType: normMimeType,
          sizeBytes
        })
      });
    } catch (auditErr) {
      // Audit failures are non-fatal: log and continue.
      LOG.warn('Audit log entry failed', {
        documentId,
        correlationId,
        error: auditErr.message
      });
    }

    LOG.info('Document metadata persisted (Object Store PENDING)', {
      documentId,
      ragProfileId,
      correlationId
    });

    return {
      documentId,
      objectStoreKey,
      status: 'uploaded',
      // OBJECT_STORE_PENDING: metadata saved; binary transfer to Object Store
      // is not yet implemented (Phase 2).
      technicalCode: 'OBJECT_STORE_PENDING',
      correlationId
    };
  });

  srv.on('triggerIngestion', async (req) => {
    req.error(501, 'triggerIngestion is not yet implemented (Phase 2).');
  });

  srv.on('deleteDocument', async (req) => {
    req.error(501, 'deleteDocument is not yet implemented (Phase 2).');
  });
});
