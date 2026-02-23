using phoron.rag as db from '../db/schema';

// Phase 1 (MVP): @requires annotations are present as target design but inactive with auth: dummy.
// Enable in Phase 2 by switching to IAS/XSUAA in package.json/cds.requires.

service ChatService {

  /**
   * Submit a question to the RAG chat backend.
   *
   * Required  : question, ragProfileId
   * Optional  : conversationId (link to an existing conversation; omit to start a new one)
   *
   * Errors carry a machine-readable `code` (technicalCode) and the
   * `X-Correlation-ID` response header for end-to-end tracing.
   */
  @requires: 'ChatUser'
  action askQuestion(
    @mandatory question      : String,   // 1–2000 chars; trimmed server-side
    @mandatory ragProfileId  : UUID,     // scopes vector store lookup
              conversationId : UUID      // optional – omit to start a new conversation
  ) returns AskQuestionResponse;

  @requires: 'ChatUser'
  entity Conversations as projection on db.Conversations;

  @requires: 'ChatUser'
  entity Messages      as projection on db.Messages;
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
