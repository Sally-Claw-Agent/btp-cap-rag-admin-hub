'use strict';

const cds = require('@sap/cds');

/**
 * RagAdminService – Phase 1 baseline stubs.
 * Actions return 501 until Object Store and AI Core ingestion integration is built.
 */
module.exports = cds.service.impl(function (srv) {
  srv.on('uploadDocument', async (req) => {
    req.error(501, 'uploadDocument is not yet implemented (Phase 2).');
  });

  srv.on('triggerIngestion', async (req) => {
    req.error(501, 'triggerIngestion is not yet implemented (Phase 2).');
  });

  srv.on('deleteDocument', async (req) => {
    req.error(501, 'deleteDocument is not yet implemented (Phase 2).');
  });
});
