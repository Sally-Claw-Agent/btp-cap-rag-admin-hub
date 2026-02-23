using phoron.rag as db from '../db/schema';

// Phase 1 (MVP): @requires annotations are present as target design but inactive with auth: dummy.
// Enable in Phase 2 by switching to IAS/XSUAA in package.json/cds.requires.

service RagAdminService {

  @requires: 'RagAdmin'
  action uploadDocument(
    ragProfileId  : UUID,
    fileName      : String,
    mimeType      : String,
    sizeBytes     : Integer64,
    checksumSha256: String
  ) returns UploadDocumentResponse;

  @requires: 'RagAdmin'
  action triggerIngestion(
    documentId    : UUID,
    mode          : String   // ingest|reindex
  ) returns JobResponse;

  @requires: 'RagAdmin'
  action deleteDocument(
    documentId    : UUID,
    hardDelete    : Boolean
  ) returns ActionResult;

  @requires: 'RagAdmin'
  entity Documents      as projection on db.Documents;

  @requires: 'RagAdmin'
  entity IngestionJobs  as projection on db.IngestionJobs;

  @requires: 'RagAdmin'
  entity RagProfiles    as projection on db.RagProfiles;

  @requires: 'SupportReadOnly'
  entity AuditLogs      as projection on db.AuditLogs;
}

type UploadDocumentResponse {
  documentId      : UUID;
  objectStoreKey  : String;
  status          : String;
  technicalCode   : String;
}

type JobResponse {
  jobId           : UUID;
  status          : String;
  externalJobRef  : String;
}

type ActionResult {
  ok              : Boolean;
  message         : String;
  technicalCode   : String;
}
