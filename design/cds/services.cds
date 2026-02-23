using phoron.rag as db from './schema';

/**
 * Konzept-Entwurf (nicht implementiert)
 *
 * Hinweis zur Planung:
 * - MVP (Phase 1) läuft ohne Login/Auth/Rollen.
 * - Die unten modellierten @requires-Annotationen gelten als Zielbild für Phase 2 (Security).
 */

service ChatService {

  @requires: 'ChatUser'
  action askQuestion(
    question      : String,
    ragProfileId  : UUID,
    conversationId: UUID
  ) returns AskQuestionResponse;

  @requires: 'ChatUser'
  entity Conversations as projection on db.Conversations;

  @requires: 'ChatUser'
  entity Messages as projection on db.Messages;
}

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
    documentId : UUID,
    mode       : String   // ingest|reindex
  ) returns JobResponse;

  @requires: 'RagAdmin'
  action deleteDocument(
    documentId : UUID,
    hardDelete : Boolean
  ) returns ActionResult;

  @requires: 'RagAdmin'
  entity Documents as projection on db.Documents;

  @requires: 'RagAdmin'
  entity IngestionJobs as projection on db.IngestionJobs;

  @requires: 'RagAdmin'
  entity RagProfiles as projection on db.RagProfiles;

  @requires: 'SupportReadOnly'
  entity AuditLogs as projection on db.AuditLogs;
}

type AskQuestionResponse {
  conversationId  : UUID;
  messageId       : UUID;
  answer          : AnswerPayload;
  citations       : many Citation;
  model           : ModelInfo;
  technicalCode   : String;
  correlationId   : String;
}

type AnswerPayload {
  format          : String; // markdown|plain
  markdown        : String;
  plainText       : String;
}

type Citation {
  id              : String;
  title           : String;
  sourceType      : String; // object-store-document|web|kb
  documentId      : UUID;
  chunkId         : String;
  page            : Integer;
  uri             : String;
  score           : Decimal(5,4);
}

type ModelInfo {
  name            : String;
  latencyMs       : Integer;
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
