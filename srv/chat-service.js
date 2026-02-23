'use strict';

const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { DestinationSelectionStrategies } = require('@sap-cloud-sdk/connectivity');

const LEGACY_PROXY_BASE_URL =
  process.env.AI_CORE_PROXY_BASE_URL ||
  'https://aicore-proxy-btp.cfapps.eu10-004.hana.ondemand.com';

const USE_LEGACY_PROXY =
  (process.env.AI_USE_LEGACY_PROXY || 'true').toLowerCase() === 'true';
const {
  buildOrchestrationPayload,
  parseOrchestrationReply,
  getOrchestrationEndpoint
} = require('./aicore-proxy');

module.exports = cds.service.impl(async function (srv) {
  /**
   * POST /odata/v4/ChatService/askQuestion
   * { question, ragProfileId, conversationId }
   */
  srv.on('askQuestion', async (req) => {
    const { question, ragProfileId, conversationId } = req.data;

    if (!question?.trim()) {
      return req.error(400, 'question is required');
    }

    const correlationId =
      req.headers?.['x-correlation-id'] ||
      `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Local fallback for development without a live destination
    if ((process.env.CHATBOT_FORCE_LOCAL_FALLBACK || '').toLowerCase() === 'true') {
      return {
        conversationId: conversationId || null,
        messageId: null,
        answer: { format: 'plain', markdown: null, plainText: `[local-fallback] ${question.trim()}` },
        citations: [],
        model: { name: 'local-fallback', latencyMs: 0 },
        technicalCode: 'LOCAL_FALLBACK',
        correlationId
      };
    }

    const t0 = Date.now();
    try {
      const endpoint = getOrchestrationEndpoint();
      const payload = buildOrchestrationPayload({ message: question.trim(), ragProfileId });

      let upstreamData;

      if (USE_LEGACY_PROXY) {
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
          req.error(upstream.status, upstreamData?.error?.message || 'Upstream proxy call failed.');
        }
      } else {
        const destinationName = process.env.AI_CORE_DESTINATION_NAME || 'AI_CORE_REST_CONN';
        const upstream = await executeHttpRequest(
          { destinationName, selectionStrategy: DestinationSelectionStrategies.alwaysProvider },
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

      const { reply, parsed } = parseOrchestrationReply(upstreamData);
      const latencyMs = Date.now() - t0;

      return {
        conversationId: conversationId || null,
        messageId: null,
        answer: { format: 'markdown', markdown: reply, plainText: reply },
        citations: [],
        model: {
          name: process.env.AI_MODEL_NAME || 'gemini-2.0-flash-lite',
          latencyMs
        },
        technicalCode: parsed ? 'OK' : 'PARTIAL',
        correlationId
      };
    } catch (err) {
      const status = err?.response?.status || 502;
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Orchestration request failed.';
      req.error(status, msg);
    }
  });
});
