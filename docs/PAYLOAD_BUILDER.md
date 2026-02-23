# Server-Side Payload Builder — Reference

> **Scope:** `srv/aicore-proxy.js` and the orchestration layer in `srv/chat-service.js`.
> This document is the canonical reference for every environment variable that controls the AI Core payload builder.

---

## Principle

The UI (or any API caller) sends only three business-level fields:

```json
{ "question": "…", "ragProfileId": "<uuid>", "conversationId": "<optional-uuid>" }
```

`chat-service.js` resolves all technical IDs and configuration server-side, then calls `buildOrchestrationPayload` in `aicore-proxy.js` with fully resolved values.
The full orchestration payload is **never sent from the client**.

---

## Resolution Order: ragProfileId → repositoryId

The vector repository ID is resolved in this order:

1. **DB lookup** — `RagProfiles.repositoryId WHERE ID = ragProfileId AND isActive = true`
2. **Env var** — `AI_CORE_VECTOR_REPOSITORY_ID`
3. **Reject** — `RAG_PROFILE_NO_REPOSITORY` (400) if both are unset

In early dev environments where the DB contains no seeded profiles, set `AI_CORE_VECTOR_REPOSITORY_ID` as a global fallback.

---

## Conversation History Injection

When `AI_HISTORY_MAX_TURNS > 0` and `conversationId` is provided, the handler loads the conversation's `user`/`assistant` messages from the DB (`phoron.rag.Messages`) and injects the most recent N turn-pairs into the template **before** the grounded user question.

History loading is non-fatal: if the DB is unavailable or the conversation has no persisted messages, the request continues without history (logged as a warning).

**Template structure with history enabled:**

```
[system]  ← AI_SYSTEM_PROMPT
[user]    ← history turn N-k … user
[assistant] ← history turn N-k … assistant
   …
[user]    ← current question with {{?grounding_input_variable_1}} + {{?grounding_output_variable}}
```

> **MVP note:** Message persistence (Story 4.2) is not yet active.
> `AI_HISTORY_MAX_TURNS=0` (the default) is recommended until Story 4.2 lands.

---

## Environment Variable Reference

### Routing

| Variable | Default | Description |
|---|---|---|
| `AI_USE_LEGACY_PROXY` | `true` | Route via legacy CF proxy (`true`) or BTP Destination (`false`). |
| `AI_CORE_PROXY_BASE_URL` | `https://aicore-proxy-btp.cfapps.eu10-004.hana.ondemand.com` | Base URL of the legacy proxy. Only used when `AI_USE_LEGACY_PROXY=true`. |
| `AI_CORE_DESTINATION_NAME` | `AI_CORE_REST_CONN` | BTP Destination name. Only used when `AI_USE_LEGACY_PROXY=false`. |

### Deployment / Endpoint

| Variable | Default | Description |
|---|---|---|
| `AI_CORE_ORCHESTRATION_ENDPOINT` | `/v2/inference/deployments/d0246f61c3352271/completion` | Full path to the AI Core orchestration deployment. **Must be overridden in production.** |
| `AI_RESOURCE_GROUP` | `default` | Value of the `AI-Resource-Group` request header. |

### Repository (Grounding)

| Variable | Default | Description |
|---|---|---|
| `AI_CORE_VECTOR_REPOSITORY_ID` | _(dev fallback UUID)_ | Fallback vector repository ID when the `RagProfiles` DB lookup yields no result. **Set this in all non-dev environments.** |
| `AI_MAX_CHUNK_COUNT` | `6` | Maximum number of grounding chunks returned by the document grounding filter. |

### Prompt / Templating

| Variable | Default | Description |
|---|---|---|
| `AI_SYSTEM_PROMPT` | _(built-in neutral prompt)_ | Override the system prompt injected as the first template message. Multiline strings work; escape newlines in shell env files. |
| `AI_HISTORY_MAX_TURNS` | `0` | Number of recent user/assistant turn-pairs to inject before the current question. `0` disables history injection entirely. |

### LLM

| Variable | Default | Description |
|---|---|---|
| `AI_MODEL_NAME` | `gemini-2.0-flash-lite` | LLM model identifier as registered in AI Core. |
| `AI_MAX_OUTPUT_TOKENS` | `1024` | Maximum tokens in the model response. |
| `AI_TEMPERATURE` | `0.1` | Sampling temperature (0.0 = deterministic, 1.0 = creative). |
| `AI_MODEL_VERSION` | `001` | Model version string as expected by the deployment. |

### Development

| Variable | Default | Description |
|---|---|---|
| `CHATBOT_FORCE_LOCAL_FALLBACK` | `false` | Set to `true` to skip AI Core entirely. Returns a `[local-fallback]` echo of the question. Useful for UI and contract testing without connectivity. |

---

## Error Codes from the Payload Builder Layer

| Code | HTTP | Trigger |
|---|---|---|
| `RAG_PROFILE_NO_REPOSITORY` | 400 | `ragProfileId` not found in DB **and** `AI_CORE_VECTOR_REPOSITORY_ID` is unset. |
| `UPSTREAM_PROXY_ERROR` | upstream | Legacy proxy returned a non-2xx status. |
| `UPSTREAM_ERROR` | 502 | `fetch` / Cloud SDK call threw an unstructured error. |

For validation error codes (`VALIDATION_*`) see `docs/ASK_QUESTION_API.md`.

---

## Payload Shape (Informational)

The payload sent to AI Core looks like the following.
This is server-internal – clients never see or send this structure.

```json
{
  "orchestration_config": {
    "module_configurations": {
      "grounding_module_config": {
        "type": "document_grounding_service",
        "config": {
          "filters": [{
            "id": "filter1",
            "search_config": { "max_chunk_count": 6 },
            "data_repositories": ["<resolved-repositoryId>"],
            "data_repository_type": "vector"
          }],
          "input_params": ["grounding_input_variable_1"],
          "output_param": "grounding_output_variable"
        }
      },
      "templating_module_config": {
        "template": [
          { "role": "system", "content": [{ "type": "text", "text": "<AI_SYSTEM_PROMPT>" }] },
          // … injected history turns (when AI_HISTORY_MAX_TURNS > 0) …
          { "role": "user",   "content": [{ "type": "text", "text": "UserQuestion: {{?grounding_input_variable_1}}, Context: {{?grounding_output_variable}}" }] }
        ],
        "defaults": { "grounding_input_variable_1": "" }
      },
      "llm_module_config": {
        "model_name": "<AI_MODEL_NAME>",
        "model_params": { "max_output_tokens": 1024, "temperature": 0.1 },
        "model_version": "<AI_MODEL_VERSION>"
      }
    }
  },
  "input_params": { "grounding_input_variable_1": "<user-question>" }
}
```
