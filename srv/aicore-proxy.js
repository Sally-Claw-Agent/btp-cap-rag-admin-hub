'use strict';

/**
 * SAP AI Core orchestration helper.
 *
 * All deployment/model/repository IDs are read from environment variables so
 * nothing secret is hard-coded.  Set CHATBOT_FORCE_LOCAL_FALLBACK=true during
 * local development to skip the actual AI Core call.
 */

const DEFAULT_DEPLOYMENT_PATH =
  process.env.AI_CORE_ORCHESTRATION_ENDPOINT ||
  '/v2/inference/deployments/REPLACE_DEPLOYMENT_ID/completion';

const DEFAULT_REPOSITORY_ID =
  process.env.AI_CORE_DEFAULT_REPOSITORY_ID || 'REPLACE_REPOSITORY_ID';

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful RAG assistant. Answer strictly based on the provided context. ' +
  'If the information is not in the context, say so clearly.';

function getOrchestrationEndpoint() {
  return process.env.AI_CORE_ORCHESTRATION_ENDPOINT || DEFAULT_DEPLOYMENT_PATH;
}

/**
 * Build the SAP AI Core orchestration payload for a RAG question.
 *
 * @param {object} opts
 * @param {string} opts.message     - The user question.
 * @param {string} [opts.ragProfileId] - Optional RAG profile ID used as label in the filter.
 * @returns {object} Ready-to-POST orchestration payload.
 */
function buildOrchestrationPayload({ message, ragProfileId }) {
  const repositoryId =
    process.env.AI_CORE_VECTOR_REPOSITORY_ID || DEFAULT_REPOSITORY_ID;

  return {
    orchestration_config: {
      module_configurations: {
        grounding_module_config: {
          type: 'document_grounding_service',
          config: {
            filters: [
              {
                id: `repo-${ragProfileId || 'default'}`,
                search_config: { max_chunk_count: 6 },
                data_repositories: [repositoryId],
                data_repository_type: 'vector'
              }
            ],
            input_params: ['user_question'],
            output_param: 'grounding_context'
          }
        },
        templating_module_config: {
          template: [
            {
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT
                }
              ]
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Question: {{?user_question}}\nContext: {{?grounding_context}}'
                }
              ]
            }
          ],
          defaults: { user_question: '' }
        },
        llm_module_config: {
          model_name: process.env.AI_MODEL_NAME || 'gemini-2.0-flash-lite',
          model_params: {
            max_output_tokens: parseInt(process.env.AI_MAX_OUTPUT_TOKENS || '1024', 10),
            temperature: parseFloat(process.env.AI_TEMPERATURE || '0.1')
          },
          model_version: process.env.AI_MODEL_VERSION || '001'
        }
      }
    },
    input_params: { user_question: message }
  };
}

/**
 * Extract the reply text from an AI Core orchestration response.
 * Handles multiple response shapes defensively.
 *
 * @param {object} data - Raw response body from AI Core.
 * @returns {{ reply: string, parsed: boolean }}
 */
function parseOrchestrationReply(data) {
  if (!data) return { reply: 'No response received from AI Core.', parsed: false };

  const candidates = [
    data?.orchestration_result?.choices?.[0]?.message?.content,
    data?.orchestration_result?.response,
    data?.choices?.[0]?.message?.content,
    data?.choices?.[0]?.text,
    data?.output_text,
    data?.completion,
    data?.reply,
    data?.message
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return { reply: candidate.trim(), parsed: true };
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
      if (text) return { reply: text, parsed: true };
    }
  }

  return { reply: 'Could not extract text from AI Core response.', parsed: false };
}

module.exports = { buildOrchestrationPayload, parseOrchestrationReply, getOrchestrationEndpoint };
