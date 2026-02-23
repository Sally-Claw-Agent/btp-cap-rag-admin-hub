'use strict';

/**
 * Custom CAP server entry point.
 *
 * Responsibilities:
 *   - Express middleware setup (body parsing, correlation ID, request logging)
 *   - Health / liveness endpoints (/ and /health)
 *   - Raw /v2 reverse proxy → SAP AI Core via BTP Destination (kept for low-level
 *     access and local debugging without going through CDS service machinery)
 *
 * The ChatService.askQuestion and RagAdminService actions are handled by their
 * respective CDS service implementations in srv/.
 */

const cds = require('@sap/cds');
const express = require('express');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { DestinationSelectionStrategies } = require('@sap-cloud-sdk/connectivity');

function createCorrelationId() {
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

cds.on('bootstrap', (app) => {
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health / liveness
  app.get('/', (_req, res) => res.status(200).json({ ok: true }));
  app.get('/health', (_req, res) =>
    res.status(200).json({ ok: true, service: 'btp-cap-rag-admin-hub' })
  );

  // Attach correlation ID and log inbound requests to key paths
  app.use((req, _res, next) => {
    req.correlationId =
      req.headers['x-correlation-id'] || createCorrelationId();
    if (req.path.startsWith('/v2') || req.path.startsWith('/odata')) {
      console.info(
        `[CAP][${req.correlationId}] ${req.method} ${req.originalUrl}`
      );
    }
    next();
  });

  /**
   * Raw /v2 reverse proxy → AI Core via BTP Destination.
   *
   * Proxies the full URL (including query string) verbatim so any AI Core
   * v2 path can be called directly – useful during development and testing.
   *
   * In production the ChatService.askQuestion action should be preferred as
   * it builds the structured orchestration payload and normalises the reply.
   */
  app.use('/v2', async (req, res) => {
    try {
      const destinationName =
        process.env.AI_CORE_DESTINATION_NAME || 'AI_CORE_REST_CONN';

      const resp = await executeHttpRequest(
        {
          destinationName,
          selectionStrategy: DestinationSelectionStrategies.alwaysProvider
        },
        {
          method: req.method,
          url: req.originalUrl,
          headers: {
            accept: req.headers.accept || 'application/json',
            'content-type':
              req.headers['content-type'] || 'application/json'
          },
          data: req.body
        }
      );

      res.status(resp.status);
      if (resp.headers?.['content-type']) {
        res.set('content-type', resp.headers['content-type']);
      }
      res.send(resp.data);
    } catch (e) {
      const status = e?.response?.status || 500;
      const data = e?.response?.data || { message: String(e?.message || e) };
      res
        .status(status)
        .json({ proxyError: true, status, data, correlationId: req.correlationId });
    }
  });
});

module.exports = cds.server;
