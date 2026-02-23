# API Contract Beispiele (konzeptionell)

## 1) ChatService.askQuestion

### Request

```json
{
  "question": "Wie ist der aktuelle Stand zu Projekt X?",
  "ragProfileId": "2fa7baf6-52d7-4de1-8800-6d34c4283a31",
  "conversationId": "9d10f3ef-e0f4-4d94-9bcb-c3f26dc4bb6b"
}
```

### Response

```json
{
  "conversationId": "9d10f3ef-e0f4-4d94-9bcb-c3f26dc4bb6b",
  "messageId": "32c57b5f-caf0-4021-8d7f-8f9659272b70",
  "answerText": "Hier ist der konsolidierte Status...",
  "modelName": "gpt-4.1-mini",
  "technicalCode": "OK",
  "correlationId": "req-20260223-000123"
}
```

## 2) RagAdminService.uploadDocument

### Request (Metadaten, Datei-Transport je nach Implementierung)

```json
{
  "ragProfileId": "2fa7baf6-52d7-4de1-8800-6d34c4283a31",
  "fileName": "release-notes-2026-02.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 245190,
  "checksumSha256": "ab12cd..."
}
```

### Response

```json
{
  "documentId": "2b43187b-6b7f-49b7-9074-e9b5ec497a3b",
  "objectStoreKey": "rag/profiles/prod/release-notes-2026-02.pdf",
  "status": "uploaded",
  "technicalCode": "DOC_UPLOADED"
}
```

## 3) RagAdminService.triggerIngestion

### Request

```json
{
  "documentId": "2b43187b-6b7f-49b7-9074-e9b5ec497a3b",
  "mode": "ingest"
}
```

### Response

```json
{
  "jobId": "758b22ce-6f5f-4d5a-aef3-12a45d659f0a",
  "status": "queued",
  "externalJobRef": "aicore-job-991234"
}
```

## 4) Fehlerobjekt (Standard)

```json
{
  "error": {
    "message": "Upload fehlgeschlagen. Bitte Dateityp prüfen.",
    "technicalCode": "DOC_INVALID_MIME",
    "correlationId": "req-20260223-000124"
  }
}
```
