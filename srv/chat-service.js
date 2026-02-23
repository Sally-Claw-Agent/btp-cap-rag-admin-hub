'use strict';

const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { DestinationSelectionStrategies } = require('@sap-cloud-sdk/connectivity');
const {
  buildOrchestrationPayload,
  parseOrchestrationReply,
  getOrchestrationEndpoint
} = require('./aicore-proxy');

const LOG = cds.log('chat-service');

const LEGACY_PROXY_BASE_URL =
  process.env.AI_CORE_PROXY_BASE_URL ||
  'https://aicore-proxy-btp.cfapps.eu10-004.hana.ondemand.com';

const USE_LEGACY_PROXY =
  (process.env.AI_USE_LEGACY_PROXY || 'true').toLowerCase() === 'true';

/** RFC 4122 UUID pattern – covers v1–v5 and nil UUID. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QUESTION_MAX_LENGTH = 2000;

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
 * Using a dedicated helper (rather than inline `req.reject`) guarantees every
 * error path through the handler produces a consistent error object shape.
 *
 * @param {object} req           - CAP request context
 * @param {number} status        - HTTP status code (400, 502, …)
 * @param {string} technicalCode - Machine-readable error identifier (SCREAMING_SNAKE)
 * @param {string} message       - Human-readable error message (English)
 * @param {string} correlationId - Correlation ID for end-to-end tracing
 */
function rejectWith(req, status, technicalCode, message, correlationId) {
  req.res?.set('X-Correlation-ID', correlationId);
  const err = Object.assign(new Error(message), { code: technicalCode, status });
  throw err;
}

/**
 * Resolve the vector repository ID for a given RAG profile.
 *
 * Resolution order:
 *  1. DB lookup: RagProfiles.repositoryId where ID = ragProfileId AND isActive = true
 *  2. Env var:   AI_CORE_VECTOR_REPOSITORY_ID
 *  3. null       (caller decides whether to reject)
 *
 * A failed DB lookup is non-fatal – the caller receives null from the env
 * fallback path and can choose to continue or reject the request.
 *
 * @param {string} ragProfileId  - UUID of the RAG profile.
 * @param {string} correlationId - For log correlation only.
 * @returns {Promise<string|null>} Resolved repository ID, or null if not found.
 */
async function resolveRepositoryId(ragProfileId, correlationId) {
  try {
    const profile = await SELECT.one
      .from('phoron.rag.RagProfiles')
      .where({ ID: ragProfileId, isActive: true })
      .columns('repositoryId');

    if (profile?.repositoryId) {
      return profile.repositoryId;
    }

    // Profile not found or has no repositoryId configured
    LOG.warn('RAG profile not found or missing repositoryId; falling back to env', {
      ragProfileId,
      correlationId
    });
  } catch (dbErr) {
    // Non-fatal – DB may be uninitialized in early dev environments
    LOG.warn('DB lookup for RAG profile failed; falling back to env', {
      ragProfileId,
      correlationId,
      error: dbErr.message
    });
  }

  return process.env.AI_CORE_VECTOR_REPOSITORY_ID || null;
}

/**
 * Load conversation history for the given conversation, limited to the most
 * recent AI_HISTORY_MAX_TURNS turn pairs.
 *
 * Returns an empty array when:
 *  - AI_HISTORY_MAX_TURNS is 0 (default, history disabled)
 *  - conversationId is not provided
 *  - DB lookup fails (non-fatal; logged as warning)
 *
 * @param {string|null} conversationId - UUID of the conversation to load.
 * @param {string}      correlationId  - For log correlation only.
 * @returns {Promise<Array<{role:string, content:string}>>}
 */
async function loadConversationHistory(conversationId, correlationId) {
  const historyMaxTurns = parseInt(process.env.AI_HISTORY_MAX_TURNS || '0', 10);

  if (!conversationId || historyMaxTurns <= 0) return [];

  try {
    // Load messages in chronological order; the payload builder will apply
    // the maxTurns window from the tail of the array.
    const msgs = await SELECT
      .from('phoron.rag.Messages')
      .where({
        conversation_ID: conversationId,
        role: { in: ['user', 'assistant'] }
      })
      .columns('role', 'content')
      .orderBy('createdAt asc');

    return msgs || [];
  } catch (dbErr) {
    // Non-fatal – message persistence may not yet be active (Story 4.2)
    LOG.warn('History loading failed; proceeding without history', {
      conversationId,
      correlationId,
      error: dbErr.message
    });
    return [];
  }
}

module.exports = cds.service.impl(async function (srv) {
  /**
   * POST /odata/v4/chat/askQuestion
   *
   * Accepted inputs (no other fields are forwarded):
   *   question       String  – Required, 1–2000 chars, trimmed before use
   *   ragProfileId   UUID    – Required, used to scope the vector store lookup
   *   conversationId UUID    – Optional, links the exchange to an existing conversation
   *
   * Server-side resolution flow (before calling AI Core):
   *   1. Validate inputs strictly.
   *   2. ragProfileId → repositoryId  via DB lookup (RagProfiles.repositoryId),
   *      falling back to AI_CORE_VECTOR_REPOSITORY_ID env var.
   *   3. Conversation history loaded from DB if AI_HISTORY_MAX_TURNS > 0
   *      and conversationId is present.
   *   4. buildOrchestrationPayload assembles the full AI Core payload from
   *      resolved inputs – the UI never sends orchestration details.
   *
   * Returns AskQuestionResponse (see chat-service.cds).
   * All error responses carry:
   *   – OData `error.code`          → technicalCode (SCREAMING_SNAKE string)
   *   – HTTP header X-Correlation-ID → correlationId for end-to-end tracing
   */
  srv.on('askQuestion', async (req) => {
    // Destructure only the declared inputs – guards against extra fields from untrusted callers.
    const { question, ragProfileId, conversationId } = req.data;

    // Establish correlation ID as the first action so EVERY error response carries it,
    // including early validation failures.
    const correlationId =
      req.headers?.['x-correlation-id'] || makeCorrelationId();
    req.res?.set('X-Correlation-ID', correlationId);

    // ── Input validation ────────────────────────────────────────────────────
    if (!question?.trim()) {
      rejectWith(
        req, 400,
        'VALIDATION_QUESTION_REQUIRED',
        "Field 'question' is required and must not be empty.",
        correlationId
      );
    }

    if (question.trim().length > QUESTION_MAX_LENGTH) {
      rejectWith(
        req, 400,
        'VALIDATION_QUESTION_TOO_LONG',
        `Field 'question' must not exceed ${QUESTION_MAX_LENGTH} characters.`,
        correlationId
      );
    }

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

    if (conversationId != null && !UUID_RE.test(conversationId)) {
      rejectWith(
        req, 400,
        'VALIDATION_CONVERSATION_INVALID_UUID',
        "Field 'conversationId' must be a valid UUID (RFC 4122) when provided.",
        correlationId
      );
    }
    // ── /validation ─────────────────────────────────────────────────────────

    // Local fallback: skip AI Core entirely during development.
    if ((process.env.CHATBOT_FORCE_LOCAL_FALLBACK || '').toLowerCase() === 'true') {
      return {
        conversationId: conversationId ?? null,
        messageId: null,
        answer: {
          format: 'plain',
          markdown: null,
          plainText: `[local-fallback] ${question.trim()}`
        },
        citations: [],
        model: { name: 'local-fallback', latencyMs: 0 },
        technicalCode: 'LOCAL_FALLBACK',
        correlationId
      };
    }

    // ── Server-side resolution ───────────────────────────────────────────────

    // 1. Resolve vector repository ID from DB profile, then env, then reject.
    const repositoryId = await resolveRepositoryId(ragProfileId, correlationId);
    if (!repositoryId) {
      rejectWith(
        req, 400,
        'RAG_PROFILE_NO_REPOSITORY',
        `No vector repository ID could be resolved for profile '${ragProfileId}'. ` +
          'Ensure the profile exists in RagProfiles with a repositoryId, ' +
          'or set AI_CORE_VECTOR_REPOSITORY_ID.',
        correlationId
      );
    }

    // 2. Load conversation history (no-op when AI_HISTORY_MAX_TURNS=0 or no conversationId).
    const history = await loadConversationHistory(conversationId, correlationId);

    // ── AI Core / proxy call ─────────────────────────────────────────────────
    const t0 = Date.now();
    try {
      const endpoint = getOrchestrationEndpoint();
      const payload = buildOrchestrationPayload({
        message: question.trim(),
        repositoryId,
        history
      });

      let upstreamData;

      if (USE_LEGACY_PROXY) {
        // Route through the legacy Cloud Foundry proxy (AI_USE_LEGACY_PROXY=true, default).
        const upstream = await fetch(`${LEGACY_PROXY_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'AI-Resource-Group': process.env.AI_RESOURCE_GROUP || 'default',
            'X-Correlation-ID': correlationId
          },
          body: JSON.stringify(payload)
        });

        upstreamData = await upstream.json();

        if (!upstream.ok) {
          rejectWith(
            req,
            upstream.status,
            'UPSTREAM_PROXY_ERROR',
            upstreamData?.error?.message || 'Upstream proxy call failed.',
            correlationId
          );
        }
      } else {
        // Route through the BTP Destination (AI_USE_LEGACY_PROXY=false).
        const destinationName =
          process.env.AI_CORE_DESTINATION_NAME || 'AI_CORE_REST_CONN';

        const upstream = await executeHttpRequest(
          {
            destinationName,
            selectionStrategy: DestinationSelectionStrategies.alwaysProvider
          },
          {
            method: 'POST',
            url: endpoint,
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              'AI-Resource-Group': process.env.AI_RESOURCE_GROUP || 'default',
              'X-Correlation-ID': correlationId
            },
            data: payload
          }
        );
        upstreamData = upstream.data;
      }

      const parseResult = parseOrchestrationReply(upstreamData);
      const latencyMs = Date.now() - t0;

      // AI Core returned HTTP 200 but with an error body — reject with user-safe message.
      if (parseResult.aiCoreError) {
        rejectWith(
          req,
          502,
          'UPSTREAM_RESPONSE_ERROR',
          'The AI service returned an error response. Please try again or contact support.',
          correlationId
        );
      }

      const technicalCode = !parseResult.parsed
        ? 'PARTIAL'
        : parseResult.truncated
          ? 'PARTIAL_TRUNCATED'
          : 'OK';

      return {
        conversationId: conversationId ?? null,
        messageId: null,
        answer: {
          format: parseResult.format,
          markdown: parseResult.reply,
          plainText: parseResult.reply
        },
        citations: [],
        model: {
          name: process.env.AI_MODEL_NAME || 'gemini-2.0-flash-lite',
          latencyMs
        },
        technicalCode,
        correlationId
      };
    } catch (err) {
      // Structured errors from rejectWith (already carry code + status) – re-throw
      // so the CAP framework handles them without double-wrapping.
      if (err.code && err.status) throw err;

      // Unstructured errors from fetch / executeHttpRequest
      const status = err?.response?.status || 502;
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Orchestration request failed.';
      rejectWith(req, status, 'UPSTREAM_ERROR', msg, correlationId);
    }
  });
});
