namespace phoron.rag;

using { cuid, managed } from '@sap/cds/common';

/**
 * Konzept-Entwurf (nicht implementiert)
 */

entity RagProfiles : cuid, managed {
  code            : String(80);
  name            : String(255);
  description     : String(1000);
  repositoryId    : String(255);
  isActive        : Boolean default true;
}

entity Documents : cuid, managed {
  ragProfile      : Association to RagProfiles;
  originalName    : String(500);
  mimeType        : String(120);
  sizeBytes       : Integer64;
  objectStoreKey  : String(1000);
  checksumSha256  : String(64);
  status          : String(30);   // uploaded|queued|running|indexed|failed|deleted
  uploadedBy      : String(255);
  errorCode       : String(80);
  errorMessage    : String(2000);
}

entity IngestionJobs : cuid, managed {
  document         : Association to Documents;
  ragProfile       : Association to RagProfiles;
  jobType          : String(30);  // ingest|reindex|delete
  status           : String(30);  // queued|running|succeeded|failed
  startedAt        : Timestamp;
  finishedAt       : Timestamp;
  externalJobRef   : String(255);
  technicalMessage : String(4000);
}

entity Conversations : cuid, managed {
  userId           : String(255);
  title            : String(255);
  ragProfile       : Association to RagProfiles;
  lastMessageAt    : Timestamp;
  isArchived       : Boolean default false;
}

entity Messages : cuid, managed {
  conversation     : Association to Conversations;
  role             : String(20); // user|assistant|system
  content          : LargeString;
  tokenUsage       : Integer;
  modelName        : String(255);
  requestRef       : String(255);
}

entity AuditLogs : cuid, managed {
  actorUserId      : String(255);
  action           : String(80);   // upload|delete|reindex|ask
  targetType       : String(80);   // document|conversation|profile
  targetId         : String(255);
  result           : String(30);   // success|failed
  correlationId    : String(120);
  details          : LargeString;
}
