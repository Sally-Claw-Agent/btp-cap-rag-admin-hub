'use strict';

/**
 * SAP AI Core orchestration helper — server-side payload builder.
 *
 * Responsibilities:
 *  - Build the full orchestration payload from minimal inputs
 *    (question, repositoryId, conversation history).
 *  - Parse AI Core responses into a normalised reply string.
 *
 * Design principles:
 *  - The caller (chat-service.js) resolves all business-level IDs
 *    (ragProfileId → repositoryId) before calling this module.
 *  - Every configurable knob is exposed as an environment variable.
 *    No model IDs, repository IDs, or prompt text are hard-coded.
 *  - See docs/PAYLOAD_BUILDER.md for the full env-var reference.
 */

// ── Endpoint ────────────────────────────────────────────────────────────────

/** Fallback deployment path used when AI_CORE_ORCHESTRATION_ENDPOINT is unset. */
const DEFAULT_DEPLOYMENT_PATH =
  '/v2/inference/deployments/d0246f61c3352271/completion';

/**
 * Return the configured orchestration endpoint path.
 * Override with AI_CORE_ORCHESTRATION_ENDPOINT.
 */
function getOrchestrationEndpoint() {
  return process.env.AI_CORE_ORCHESTRATION_ENDPOINT || DEFAULT_DEPLOYMENT_PATH;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful RAG assistant. Answer strictly based on the provided context. ' +
  'If the information is not in the context, say so clearly.';

/**
 * Fallback repository ID when neither the DB profile lookup nor
 * AI_CORE_VECTOR_REPOSITORY_ID provides a value.
 * Override with AI_CORE_VECTOR_REPOSITORY_ID.
 *
 * @internal Hard-coded only as a last-resort dev default – must be replaced
 *           in production via the env var or a seeded RagProfile row.
 */
const FALLBACK_REPOSITORY_ID = 'c58a8c87-f12d-4712-a791-2295640dafd8';

// ── History builder ──────────────────────────────────────────────────────────

/**
 * Build the conversation-history template entries to inject before the final
 * user turn.  Only called when AI_HISTORY_MAX_TURNS > 0.
 *
 * The function expects messages in chronological order and selects the last
 * `maxTurns` consecutive user/assistant pairs.  Unpaired trailing messages
 * (e.g. the last user turn that is being answered now) are intentionally
 * excluded – the current question is injected separately via the grounding
 * template variable.
 *
 * @param {Array<{role:string, content:string}>} history - Messages in asc order.
 * @param {number} maxTurns - Maximum user+assistant pairs to include (≥ 1).
 * @returns {Array} Orchestration template entries for the history window.
 */
function buildHistoryMessages(history, maxTurns) {
  if (!maxTurns || !Array.isArray(history) || history.length === 0) return [];

  // Keep only conversational roles
  const relevant = history.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );

  // Collect consecutive user+assistant pairs
  const pairs = [];
  for (let i = 0; i + 1 < relevant.length; i += 2) {
    if (relevant[i].role === 'user' && relevant[i + 1].role === 'assistant') {
      pairs.push(relevant.slice(i, i + 2));
    }
  }

  // Take only the most recent window
  const recentPairs = pairs.slice(-Math.max(0, maxTurns));

  return recentPairs.flat().map((msg) => ({
    role: msg.role,
    content: [{ type: 'text', text: String(msg.content ?? '') }]
  }));
}

// ── Payload builder ──────────────────────────────────────────────────────────

/**
 * Build the SAP AI Core orchestration payload for a RAG question.
 *
 * Input parameters are intentionally minimal – the caller (chat-service.js)
 * is responsible for resolving business IDs (ragProfileId → repositoryId)
 * before invoking this function.
 *
 * Env-var knobs (see docs/PAYLOAD_BUILDER.md for full reference):
 *  AI_CORE_VECTOR_REPOSITORY_ID  – fallback repository ID
 *  AI_MAX_CHUNK_COUNT            – grounding filter chunk limit (default: 6)
 *  AI_SYSTEM_PROMPT              – override system prompt text
 *  AI_HISTORY_MAX_TURNS          – max user/assistant pairs to inject (default: 0)
 *  AI_MODEL_NAME                 – LLM model name
 *  AI_MAX_OUTPUT_TOKENS          – LLM max output tokens (default: 1024)
 *  AI_TEMPERATURE                – LLM temperature (default: 0.1)
 *  AI_MODEL_VERSION              – LLM model version (default: 001)
 *
 * @param {object}  opts
 * @param {string}  opts.message        - User question (already trimmed).
 * @param {string}  [opts.repositoryId] - Resolved vector repository ID.
 *                                        Falls back to AI_CORE_VECTOR_REPOSITORY_ID
 *                                        and then to the compile-time dev default.
 * @param {Array}   [opts.history]      - Conversation history in chronological order.
 *                                        Each entry: { role: 'user'|'assistant', content: string }
 *                                        Injected only when AI_HISTORY_MAX_TURNS > 0.
 * @returns {object} Ready-to-POST orchestration payload.
 */
function buildOrchestrationPayload({ message, repositoryId, history = [] }) {
  const repoId =
    repositoryId ||
    process.env.AI_CORE_VECTOR_REPOSITORY_ID ||
    FALLBACK_REPOSITORY_ID;

  const maxChunkCount = parseInt(process.env.AI_MAX_CHUNK_COUNT || '6', 10);
  const historyMaxTurns = parseInt(process.env.AI_HISTORY_MAX_TURNS || '0', 10);
  const historyEntries = buildHistoryMessages(history, historyMaxTurns);

  // Template: system → [history window] → grounded user question
  const template = [
    {
      role: 'system',
      content: [
        {
          type: 'text',
          text: process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT
        }
      ]
    },
    ...historyEntries,
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'UserQuestion: {{?grounding_input_variable_1}}, Context: {{?grounding_output_variable}}'
        }
      ]
    }
  ];

  return {
    orchestration_config: {
      module_configurations: {
        grounding_module_config: {
          type: 'document_grounding_service',
          config: {
            filters: [
              {
                id: 'filter1',
                search_config: { max_chunk_count: maxChunkCount },
                data_repositories: [repoId],
                data_repository_type: 'vector'
              }
            ],
            input_params: ['grounding_input_variable_1'],
            output_param: 'grounding_output_variable'
          }
        },
        templating_module_config: {
          template,
          defaults: { grounding_input_variable_1: '' }
        },
        llm_module_config: {
          model_name: process.env.AI_MODEL_NAME || 'gemini-2.0-flash-lite',
          model_params: {
            max_output_tokens: parseInt(
              process.env.AI_MAX_OUTPUT_TOKENS || '1024',
              10
            ),
            temperature: parseFloat(process.env.AI_TEMPERATURE || '0.1')
          },
          model_version: process.env.AI_MODEL_VERSION || '001'
        }
      }
    },
    input_params: { grounding_input_variable_1: message }
  };
}

// ── Citation extractor ───────────────────────────────────────────────────────

/**
 * Extract and deduplicate citations from the AI Core grounding module result.
 *
 * Probes the following chunk-list paths under
 * `data.orchestration_result.module_results.grounding`, in priority order:
 *   1. `.grounding_chunks`  – observed in some AI Core Orchestration releases
 *   2. `.result`            – observed in other releases
 *   3. `.chunks`            – alternative field name
 *   4. the grounding value itself (when it is already an array)
 *
 * For each chunk the following fields are resolved from both the item root and
 * its nested `.metadata` object (item root takes precedence):
 *   documentId  – item.documentId | item.document_id | meta.documentId | meta.document_id
 *   chunkId     – item.chunkId    | item.chunk_id    | meta.chunkId    | meta.chunk_id
 *   page        – item.page | meta.page | meta.page_number | meta.pageNumber  (→ integer)
 *   score       – item.score | meta.score  (→ float)
 *   uri         – item.url  | item.uri  | meta.url | meta.uri
 *   title       – item.title | meta.title | meta.file_name | meta.fileName | meta.name
 *   sourceType  – item.sourceType | item.source_type | meta.sourceType | meta.source_type
 *                 (default: 'object-store-document')
 *
 * Deduplication key priority (first truthy wins):
 *   1. chunkId
 *   2. documentId + page  (e.g. "uuid:14")
 *   3. documentId alone
 *   4. uri
 *   5. positional index  (last resort: "__idx_N")
 *
 * @param {object} data - Raw response body from AI Core.
 * @returns {Array<object>} Normalised, deduplicated Citation objects; [] when
 *   grounding metadata is absent or unrecognised.
 */
function extractCitations(data) {
  if (!data) return [];

  const grounding = data?.orchestration_result?.module_results?.grounding;
  if (!grounding) return [];

  // Probe known chunk-list locations in priority order.
  const candidates = [
    grounding?.grounding_chunks,
    grounding?.result,
    grounding?.chunks,
    Array.isArray(grounding) ? grounding : null
  ];

  let items = null;
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      items = c;
      break;
    }
  }
  if (!items) return [];

  const seen = new Set();
  const citations = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') continue;

    const meta = (item.metadata && typeof item.metadata === 'object') ? item.metadata : {};

    // ── Field resolution ───────────────────────────────────────────────────
    const documentId =
      item.documentId || item.document_id || meta.documentId || meta.document_id || null;

    const chunkId =
      item.chunkId || item.chunk_id || meta.chunkId || meta.chunk_id || null;

    const rawPage =
      item.page != null ? item.page
      : meta.page != null ? meta.page
      : meta.page_number != null ? meta.page_number
      : meta.pageNumber != null ? meta.pageNumber
      : null;
    const page = rawPage != null && Number.isFinite(parseInt(rawPage, 10))
      ? parseInt(rawPage, 10)
      : null;

    const rawScore =
      item.score != null ? item.score
      : meta.score != null ? meta.score
      : null;
    const score = rawScore != null && Number.isFinite(parseFloat(rawScore))
      ? parseFloat(rawScore)
      : null;

    const uri =
      item.url || item.uri || meta.url || meta.uri || null;

    const title =
      item.title || meta.title || meta.file_name || meta.fileName || meta.name || null;

    const sourceType =
      item.sourceType || item.source_type || meta.sourceType || meta.source_type
      || 'object-store-document';

    // ── Deduplication ──────────────────────────────────────────────────────
    const dedupKey =
      chunkId
      || (documentId && page != null ? `${documentId}:${page}` : null)
      || documentId
      || uri
      || `__idx_${i}`;

    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    citations.push({
      id: `cit-${citations.length + 1}`,
      title: title || null,
      sourceType,
      documentId: documentId || null,
      chunkId: chunkId || null,
      page: page ?? null,
      uri: uri || null,
      score: score ?? null
    });
  }

  return citations;
}

// ── Response parser ──────────────────────────────────────────────────────────

/**
 * Known response-shape probes for AI Core orchestration, in priority order.
 * Each entry: [label, extractor]
 *
 * Probes cover:
 *  1. SAP AI Core Orchestration Service — primary choices path
 *  2. SAP AI Core Orchestration Service — nested LLM module result
 *  3. SAP AI Core Orchestration Service — simple `response` field
 *  4. OpenAI-compatible chat completion (direct `choices`)
 *  5. OpenAI-compatible text completion
 *  6-10. Simple provider shapes (`output_text`, `result.output_text`,
 *         `completion`, `reply`, `message`)
 */
const RESPONSE_SHAPE_PROBES = [
  ['orchestration_result.choices[0].message.content',
    (d) => d?.orchestration_result?.choices?.[0]?.message?.content],
  ['orchestration_result.module_results.llm.choices[0].message.content',
    (d) => d?.orchestration_result?.module_results?.llm?.choices?.[0]?.message?.content],
  ['orchestration_result.response',
    (d) => d?.orchestration_result?.response],
  ['choices[0].message.content',
    (d) => d?.choices?.[0]?.message?.content],
  ['choices[0].text',
    (d) => d?.choices?.[0]?.text],
  ['output_text',
    (d) => d?.output_text],
  ['result.output_text',
    (d) => d?.result?.output_text],
  ['completion',
    (d) => d?.completion],
  ['reply',
    (d) => d?.reply],
  ['message',
    (d) => d?.message]
];

/**
 * Extract the finish reason from the primary response shape.
 * @returns {string|null}
 */
function extractFinishReason(data) {
  return (
    data?.orchestration_result?.choices?.[0]?.finish_reason ||
    data?.orchestration_result?.module_results?.llm?.choices?.[0]?.finish_reason ||
    data?.choices?.[0]?.finish_reason ||
    null
  );
}

/**
 * Detect whether reply text contains markdown patterns.
 * @returns {'markdown'|'plain'}
 */
function detectAnswerFormat(text) {
  // Headings, bold/italic, links, unordered/ordered lists, blockquotes, code fences
  if (/(?:^#{1,6}\s|[*_]{1,2}\S|\[.+\]\(https?:\/\/|^[-*+]\s|^\d+\.\s|^>\s|```)/m.test(text)) {
    return 'markdown';
  }
  return 'plain';
}

/**
 * Attempt to extract a text string from a single candidate value.
 * Handles both plain strings and content arrays (OpenAI-style).
 * @returns {string|null}
 */
function extractTextFromCandidate(candidate) {
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  if (Array.isArray(candidate)) {
    const text = candidate
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        if (typeof item?.content === 'string') return item.content;
        return '';
      })
      .join('\n')
      .trim();
    if (text) return text;
  }
  return null;
}

/**
 * Extract the reply text from an AI Core orchestration response.
 * Probes multiple known response shapes in priority order.
 *
 * @param {object} data - Raw response body from AI Core.
 * @returns {{
 *   reply:        string,            - Extracted text; never null
 *   parsed:       boolean,           - true if a recognised probe succeeded
 *   format:       'markdown'|'plain',
 *   finishReason: string|null,       - AI Core finish reason (e.g. 'stop', 'length')
 *   truncated:    boolean,           - true when finishReason === 'length'
 *   aiCoreError:  string|null,       - set when AI Core returned an error body (HTTP 200 + error)
 *   citations:    Array<object>      - Extracted, deduplicated RAG citations ([] when absent)
 * }}
 */
function parseOrchestrationReply(data) {
  if (!data) {
    return {
      reply: 'No response received from AI Core.',
      parsed: false,
      format: 'plain',
      finishReason: null,
      truncated: false,
      aiCoreError: null,
      citations: []
    };
  }

  // Detect AI Core error-in-body: error field present but no orchestration/choices content.
  if (data.error && !data.orchestration_result && !data.choices) {
    const raw = data.error?.message ?? data.error;
    const aiCoreError = typeof raw === 'string' ? raw : 'AI Core returned an error response.';
    return {
      reply: aiCoreError,
      parsed: false,
      format: 'plain',
      finishReason: null,
      truncated: false,
      aiCoreError,
      citations: []
    };
  }

  const finishReason = extractFinishReason(data);
  const citations = extractCitations(data);

  for (const [, extract] of RESPONSE_SHAPE_PROBES) {
    const text = extractTextFromCandidate(extract(data));
    if (text) {
      return {
        reply: text,
        parsed: true,
        format: detectAnswerFormat(text),
        finishReason,
        truncated: finishReason === 'length',
        aiCoreError: null,
        citations
      };
    }
  }

  return {
    reply: 'Could not extract text from AI Core response.',
    parsed: false,
    format: 'plain',
    finishReason,
    truncated: false,
    aiCoreError: null,
    citations
  };
}

module.exports = {
  buildOrchestrationPayload,
  parseOrchestrationReply,
  getOrchestrationEndpoint,
  extractCitations
};
