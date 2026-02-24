# `uploadDocument` Action – API Reference

> Story 3.1 — Dokument-Upload API (CAP)
> GitHub Issue #13

---

## Overview

`RagAdminService.uploadDocument` registers document metadata in the CAP database (`Documents` entity)
and returns a placeholder `objectStoreKey` for the future binary upload to BTP Object Store.

**MVP status:** Metadata persistence is fully implemented. The actual binary transfer to
BTP Object Store is **deferred to Phase 2** (`technicalCode: "OBJECT_STORE_PENDING"`).

**Endpoint**

```
POST /odata/v4/rag-admin/uploadDocument
Content-Type: application/json
```

---

## Limits

| Limit               | Value                         |
|--------------------|-------------------------------|
| Max file size       | 50 MB (52,428,800 bytes)      |
| Max `fileName` length | 500 characters              |
| `checksumSha256`    | 64-char hex string (SHA-256)  |

---

## Allowed MIME Types

| MIME Type                                                                         | Description              |
|-----------------------------------------------------------------------------------|--------------------------|
| `text/plain`                                                                       | Plain text               |
| `text/markdown`                                                                    | Markdown                 |
| `text/csv`                                                                         | CSV                      |
| `text/html`                                                                        | HTML                     |
| `text/xml`                                                                         | XML (text)               |
| `application/pdf`                                                                  | PDF                      |
| `application/msword`                                                               | Word (.doc)              |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document`         | Word (.docx)             |
| `application/vnd.ms-excel`                                                         | Excel (.xls)             |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`               | Excel (.xlsx)            |
| `application/vnd.ms-powerpoint`                                                    | PowerPoint (.ppt)        |
| `application/vnd.openxmlformats-officedocument.presentationml.presentation`       | PowerPoint (.pptx)       |
| `application/json`                                                                 | JSON                     |
| `application/xml`                                                                  | XML (application)        |

---

## Request

### Schema

| Field            | Type      | Required | Constraints                                                    |
|-----------------|-----------|----------|----------------------------------------------------------------|
| `ragProfileId`   | UUID      | **Yes**  | RFC 4122 format; must reference an active `RagProfile`         |
| `fileName`       | String    | **Yes**  | 1–500 chars; no path separators (`/` `\`); no null bytes       |
| `mimeType`       | String    | **Yes**  | Must be in the allowed MIME type list (case-insensitive)       |
| `sizeBytes`      | Integer   | **Yes**  | Positive integer; max 52,428,800 (50 MB)                       |
| `checksumSha256` | String    | No       | 64-character hex string (SHA-256) when provided                |

### Example request body

```json
{
  "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "fileName": "onboarding-guide-2025.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 2097152,
  "checksumSha256": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"
}
```

### Without optional checksum

```json
{
  "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "fileName": "faq.txt",
  "mimeType": "text/plain",
  "sizeBytes": 4096
}
```

---

## Response (`UploadDocumentResponse`)

| Field            | Type   | Notes                                                                     |
|-----------------|--------|---------------------------------------------------------------------------|
| `documentId`     | UUID   | Newly assigned document ID (auto-generated)                               |
| `objectStoreKey` | String | Placeholder path: `pending/<documentId>/<fileName>` (Phase 2: real path)  |
| `status`         | String | `uploaded` — metadata saved; binary transfer pending                      |
| `technicalCode`  | String | `OBJECT_STORE_PENDING` in MVP; see table below                            |
| `correlationId`  | String | End-to-end trace ID (echo of `X-Correlation-ID` or server-generated)      |

### `technicalCode` values (success)

| `technicalCode`        | Meaning                                                              |
|-----------------------|----------------------------------------------------------------------|
| `OBJECT_STORE_PENDING` | Metadata saved; binary not yet transferred to Object Store (MVP)    |

### Example success response

```json
{
  "value": {
    "documentId": "b1c2d3e4-f5a6-7890-bcde-f12345678901",
    "objectStoreKey": "pending/b1c2d3e4-f5a6-7890-bcde-f12345678901/onboarding-guide-2025.pdf",
    "status": "uploaded",
    "technicalCode": "OBJECT_STORE_PENDING",
    "correlationId": "corr-m3k2x1-a4b5c6"
  }
}
```

---

## Error Responses

All validation and runtime errors use standard OData error format.
The `error.code` field carries a machine-readable **technicalCode**.
The `X-Correlation-ID` **response header** is present on every response (success and error).

```json
{
  "error": {
    "code": "<technicalCode>",
    "message": "<human-readable English message>"
  }
}
```

### Validation error codes (HTTP 400)

| `error.code`                          | Condition                                                       |
|--------------------------------------|-----------------------------------------------------------------|
| `VALIDATION_RAG_PROFILE_REQUIRED`     | `ragProfileId` is absent or null                               |
| `VALIDATION_RAG_PROFILE_INVALID_UUID` | `ragProfileId` is present but not a valid RFC 4122 UUID         |
| `VALIDATION_RAG_PROFILE_NOT_FOUND`    | `ragProfileId` not found in `RagProfiles` or profile inactive   |
| `VALIDATION_FILENAME_REQUIRED`        | `fileName` is absent, null, or whitespace-only                  |
| `VALIDATION_FILENAME_TOO_LONG`        | `fileName` exceeds 500 characters                               |
| `VALIDATION_FILENAME_INVALID`         | `fileName` contains `/`, `\`, or null bytes                     |
| `VALIDATION_MIME_REQUIRED`            | `mimeType` is absent or empty                                   |
| `VALIDATION_MIME_NOT_ALLOWED`         | `mimeType` is not in the allowed list                           |
| `VALIDATION_SIZE_REQUIRED`            | `sizeBytes` is absent or null                                   |
| `VALIDATION_SIZE_INVALID`             | `sizeBytes` is not a positive integer                           |
| `VALIDATION_SIZE_EXCEEDED`            | `sizeBytes` exceeds 52,428,800 (50 MB)                          |
| `VALIDATION_CHECKSUM_INVALID`         | `checksumSha256` provided but not a valid 64-char hex string    |

### Runtime error codes

| `error.code`     | HTTP Status | Condition                                                 |
|-----------------|-------------|-----------------------------------------------------------|
| `DB_INSERT_FAILED`| 500        | Database write for document metadata failed               |

---

## Object Store Placeholder Strategy (MVP)

In MVP, no binary is written to BTP Object Store. The `objectStoreKey` field uses the
format `pending/<documentId>/<fileName>` as an explicit, searchable placeholder.

Phase 2 will:
1. Replace the placeholder key with the actual BTP Object Store path after binary upload.
2. Update the document `status` from `uploaded` to `queued` once Object Store transfer succeeds.
3. Trigger ingestion via `triggerIngestion` to index the stored document in the vector store.

---

## Side Effects

- A `Documents` record is created with `status: uploaded`.
- An `AuditLogs` record is written (`action: upload`, `result: success`).

---

## Verification — curl commands

### Prerequisites

Start the server locally:

```bash
npm run watch
```

Seed a test RAG profile (one-time):

```bash
curl -s -X POST http://localhost:4004/odata/v4/rag-admin/RagProfiles \
  -H "Content-Type: application/json" \
  -d '{
    "ID": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "code": "test-profile",
    "name": "Test Profile",
    "repositoryId": "c58a8c87-f12d-4712-a791-2295640dafd8",
    "isActive": true
  }' | jq .
```

---

### Happy path – PDF upload with checksum

```bash
curl -s -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fileName": "onboarding-guide.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1048576,
    "checksumSha256": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"
  }' | jq .
```

**Expected** HTTP 200 with `technicalCode: "OBJECT_STORE_PENDING"` and a `documentId` UUID.

---

### Happy path – text upload without checksum

```bash
curl -s -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fileName": "faq.txt",
    "mimeType": "text/plain",
    "sizeBytes": 4096
  }' | jq .
```

**Expected** HTTP 200, `objectStoreKey` starts with `pending/`.

---

### Error – missing ragProfileId → VALIDATION_RAG_PROFILE_REQUIRED

```bash
curl -s -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{"fileName": "doc.pdf", "mimeType": "application/pdf", "sizeBytes": 1024}' | jq .
```

**Expected** HTTP 400, `error.code: "VALIDATION_RAG_PROFILE_REQUIRED"`.

---

### Error – disallowed MIME type → VALIDATION_MIME_NOT_ALLOWED

```bash
curl -s -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fileName": "image.png",
    "mimeType": "image/png",
    "sizeBytes": 204800
  }' | jq .
```

**Expected** HTTP 400, `error.code: "VALIDATION_MIME_NOT_ALLOWED"`.

---

### Error – file too large → VALIDATION_SIZE_EXCEEDED

```bash
curl -s -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fileName": "huge.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 104857600
  }' | jq .
```

**Expected** HTTP 400, `error.code: "VALIDATION_SIZE_EXCEEDED"`.

---

### Error – path traversal in fileName → VALIDATION_FILENAME_INVALID

```bash
curl -s -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fileName": "../secrets/key.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1024
  }' | jq .
```

**Expected** HTTP 400, `error.code: "VALIDATION_FILENAME_INVALID"`.

---

### Error – invalid checksum format → VALIDATION_CHECKSUM_INVALID

```bash
curl -s -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fileName": "doc.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1024,
    "checksumSha256": "not-a-valid-sha256"
  }' | jq .
```

**Expected** HTTP 400, `error.code: "VALIDATION_CHECKSUM_INVALID"`.

---

### Inspect correlation ID header

```bash
curl -si -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -d '{"fileName": "doc.pdf", "mimeType": "application/pdf", "sizeBytes": 1024}' \
  | grep -i x-correlation-id
```

**Expected** `X-Correlation-ID: corr-<timestamp>-<random>` present on every response including errors.

Pass your own correlation ID:

```bash
curl -si -X POST http://localhost:4004/odata/v4/rag-admin/uploadDocument \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: my-upload-trace-001" \
  -d '{"fileName": "doc.pdf", "mimeType": "application/pdf", "sizeBytes": 1024}' \
  | grep -i x-correlation-id
```

**Expected** `X-Correlation-ID: my-upload-trace-001` echoed back.

---

### Verify persisted metadata

After a successful upload, verify via the Documents entity:

```bash
curl -s "http://localhost:4004/odata/v4/rag-admin/Documents" | jq '.value[] | {ID, originalName, status, objectStoreKey}'
```

---

## Phase 2 — Object Store Integration Notes

When BTP Object Store integration is added (Phase 2), the `uploadDocument` handler should:

1. Accept binary content (multipart/form-data or pre-signed URL flow).
2. Upload binary to Object Store; receive the real storage path.
3. Update `objectStoreKey` and `status` to reflect the actual stored path.
4. Return `technicalCode: "OK"` instead of `OBJECT_STORE_PENDING`.
