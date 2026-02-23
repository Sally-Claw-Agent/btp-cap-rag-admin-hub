# `askQuestion` Action – API Reference

> Story 1.1 — CAP Action `askQuestion` (minimaler Input)
> GitHub Issue #8

---

## Overview

`ChatService.askQuestion` is the single entry point from the UI5 app to the SAP AI Core RAG backend.
The UI sends only business-relevant fields; the CAP layer builds the full orchestration payload internally.

**Endpoint**

```
POST /odata/v4/chat/askQuestion
Content-Type: application/json
```

---

## Request

### Schema

| Field           | Type   | Required | Constraints                                  |
|----------------|--------|----------|----------------------------------------------|
| `question`      | String | **Yes**  | 1–2000 characters; whitespace trimmed         |
| `ragProfileId`  | UUID   | **Yes**  | RFC 4122 format (e.g. `xxxxxxxx-xxxx-…`)      |
| `conversationId`| UUID   | No       | RFC 4122 format; omit to start a new conversation |

No other fields are accepted or forwarded.

### Minimal request body

```json
{
  "question": "What is the onboarding process for new employees?",
  "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

### With optional conversationId

```json
{
  "question": "Can you clarify step 3?",
  "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "conversationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

## Response (`AskQuestionResponse`)

| Field           | Type            | Notes                                            |
|----------------|-----------------|--------------------------------------------------|
| `conversationId`| UUID or null    | Echo of the input, or null if not provided       |
| `messageId`     | UUID or null    | Reserved – null in MVP                           |
| `answer`        | `AnswerPayload` | See below                                        |
| `citations`     | `Citation[]`    | Empty array in MVP; populated in Phase 2         |
| `model`         | `ModelInfo`     | Model name + measured latency                    |
| `technicalCode` | String          | `OK` / `PARTIAL` / `LOCAL_FALLBACK`              |
| `correlationId` | String          | End-to-end trace ID (echo or server-generated)   |

**`AnswerPayload`**

| Field       | Type          | Notes                           |
|------------|---------------|---------------------------------|
| `format`    | String        | `markdown` or `plain`           |
| `markdown`  | String        | Markdown-formatted answer text  |
| `plainText` | String        | Fallback plain text             |

### Example success response

```json
{
  "value": {
    "conversationId": null,
    "messageId": null,
    "answer": {
      "format": "markdown",
      "markdown": "The onboarding process starts with…",
      "plainText": "The onboarding process starts with…"
    },
    "citations": [],
    "model": {
      "name": "gemini-2.0-flash-lite",
      "latencyMs": 1234
    },
    "technicalCode": "OK",
    "correlationId": "corr-m3k2x1-a4b5c6"
  }
}
```

---

## Error Responses

All validation and upstream errors use standard OData error format.
The `error.code` field carries a machine-readable **technicalCode**.
The `X-Correlation-ID` **response header** carries the correlation ID for every error.

```json
{
  "error": {
    "code": "<technicalCode>",
    "message": "<human-readable English message>"
  }
}
```

### Validation error codes (HTTP 400)

| `error.code`                          | Layer            | Condition                                                |
|--------------------------------------|------------------|----------------------------------------------------------|
| `ASSERT_MANDATORY`                    | CAP framework    | `question` or `ragProfileId` is absent from the body (enforced via `@mandatory` in CDS) |
| `VALIDATION_QUESTION_REQUIRED`        | JS handler       | `question` is present but blank/whitespace-only          |
| `VALIDATION_QUESTION_TOO_LONG`        | JS handler       | `question` exceeds 2000 characters                       |
| `VALIDATION_RAG_PROFILE_INVALID_UUID` | JS handler       | `ragProfileId` is present but not a valid RFC 4122 UUID  |
| `VALIDATION_CONVERSATION_INVALID_UUID`| JS handler       | `conversationId` is provided but not a valid UUID        |

> **Note:** `ASSERT_MANDATORY` is emitted by CAP v9 before the action handler runs, so it will be seen when a mandatory field is missing from the request body entirely. The JS-layer codes fire for semantic violations (format, length, blank content) that pass the structural check.

### Upstream/runtime error codes

| `error.code`          | HTTP Status | Condition                                             |
|----------------------|-------------|-------------------------------------------------------|
| `UPSTREAM_PROXY_ERROR`| 4xx/5xx     | Legacy proxy returned a non-2xx status                |
| `UPSTREAM_ERROR`      | 502         | Network-level or unclassified AI Core call failure    |

### Special `technicalCode` values in successful responses

| `technicalCode`  | Meaning                                                     |
|-----------------|-------------------------------------------------------------|
| `OK`             | Answer extracted cleanly from AI Core response              |
| `PARTIAL`        | AI Core responded but text extraction path was a fallback   |
| `LOCAL_FALLBACK` | `CHATBOT_FORCE_LOCAL_FALLBACK=true`; no AI Core call made   |

---

## Verification — curl commands

### Prerequisites

Start the server locally:

```bash
CHATBOT_FORCE_LOCAL_FALLBACK=true npm run watch
```

> All curl commands below use the local fallback mode so no real AI Core
> connection is needed.  The server runs on `http://localhost:4004`.

---

### ✅ Happy path – minimal request

```bash
curl -s -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the onboarding process?",
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
  }' | jq .
```

**Expected** HTTP 200 with `technicalCode: "LOCAL_FALLBACK"` and the answer echoing the question.

---

### ✅ Happy path – with optional conversationId

```bash
curl -s -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Can you clarify step 3?",
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "conversationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }' | jq .
```

**Expected** HTTP 200, `conversationId` echoed in response.

---

### ❌ Missing question → VALIDATION_QUESTION_REQUIRED

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{"ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"}'
```

**Expected** HTTP 400.

Full response with body:

```bash
curl -s -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{"ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"}' | jq .
```

**Expected** `error.code: "VALIDATION_QUESTION_REQUIRED"`.

---

### ❌ Missing ragProfileId → VALIDATION_RAG_PROFILE_REQUIRED

```bash
curl -s -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{"question": "Hello?"}' | jq .
```

**Expected** `error.code: "VALIDATION_RAG_PROFILE_REQUIRED"`.

---

### ❌ Invalid UUID for ragProfileId → VALIDATION_RAG_PROFILE_INVALID_UUID

```bash
curl -s -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{"question": "Hello?", "ragProfileId": "not-a-uuid"}' | jq .
```

**Expected** `error.code: "VALIDATION_RAG_PROFILE_INVALID_UUID"`.

---

### ❌ Invalid UUID for conversationId → VALIDATION_CONVERSATION_INVALID_UUID

```bash
curl -s -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Hello?",
    "ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "conversationId": "bad-id"
  }' | jq .
```

**Expected** `error.code: "VALIDATION_CONVERSATION_INVALID_UUID"`.

---

### ❌ Question too long → VALIDATION_QUESTION_TOO_LONG

```bash
LONG_Q=$(python3 -c "print('x' * 2001)")
curl -s -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"$LONG_Q\", \"ragProfileId\": \"3fa85f64-5717-4562-b3fc-2c963f66afa6\"}" | jq .
```

**Expected** `error.code: "VALIDATION_QUESTION_TOO_LONG"`.

---

### Inspect correlation ID header

```bash
curl -si -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{"ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"}' \
  | grep -i x-correlation-id
```

**Expected** `X-Correlation-ID: corr-<timestamp>-<random>` header present on every response
(including error responses).

Pass your own correlation ID:

```bash
curl -si -X POST http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: my-trace-id-001" \
  -d '{"ragProfileId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"}' \
  | grep -i x-correlation-id
```

**Expected** `X-Correlation-ID: my-trace-id-001` echoed back.

---

## Environment variables

| Variable                       | Default                       | Description                                          |
|-------------------------------|-------------------------------|------------------------------------------------------|
| `AI_USE_LEGACY_PROXY`          | `true`                        | Route via legacy CF proxy (`true`) or BTP Destination (`false`) |
| `AI_CORE_PROXY_BASE_URL`       | *(internal default)*          | Base URL of the legacy proxy                         |
| `AI_CORE_DESTINATION_NAME`     | `AI_CORE_REST_CONN`           | BTP Destination name (used when legacy proxy is off) |
| `AI_CORE_ORCHESTRATION_ENDPOINT` | *(default deployment path)* | Full path to the AI Core deployment completion URL   |
| `AI_CORE_VECTOR_REPOSITORY_ID` | *(default repo UUID)*         | UUID of the vector store to query                    |
| `AI_RESOURCE_GROUP`            | `default`                     | AI Core resource group header value                  |
| `AI_MODEL_NAME`                | `gemini-2.0-flash-lite`       | Model identifier returned in `model.name`            |
| `AI_MAX_OUTPUT_TOKENS`         | `1024`                        | Max tokens for the LLM response                      |
| `AI_TEMPERATURE`               | `0.1`                         | LLM temperature                                      |
| `AI_SYSTEM_PROMPT`             | *(built-in RAG prompt)*       | Override the system prompt                           |
| `CHATBOT_FORCE_LOCAL_FALLBACK` | `false`                       | Skip AI Core entirely; return echo answer            |
