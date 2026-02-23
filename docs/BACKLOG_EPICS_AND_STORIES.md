# Backlog (Epic/Story) — Jira/GitHub-Issue-ready

Status: In Bearbeitung (Stories 1.1, 1.3 abgeschlossen)
Scope-Basis: MVP ohne Auth (Phase 1), Security in Phase 2

---

## Planungsprinzipien

- **MVP first:** Erst stabiler End-to-End-Flow, dann Security-Härtung
- **Thin UI / Fat Service:** UI5 sendet fachliche Inputs, CAP kapselt Orchestration
- **Contract first:** Antwortformat + Citations als fester API-Vertrag
- **SAP-konform:** CAP/OData-Services, serverseitige Integrationen, Observability

---

## EPIC 1 — Chat API Facade (MVP)

### Story 1.1 — `askQuestion` Action (minimaler Input)
**Ziel:** UI5 sendet nur `question`, `ragProfileId`, optional `conversationId`.

**Acceptance Criteria** _(#8, implemented)_
- [x] CAP Action `askQuestion` ist verfügbar (`POST /odata/v4/chat/askQuestion`)
- [x] Request mit minimalem Input wird akzeptiert (`question` + `ragProfileId`; `conversationId` optional)
- [x] Validierungsfehler liefern standardisiertes Fehlerobjekt (`error.code` = technicalCode, `X-Correlation-ID` Header)
- [x] Kein direkter AI-Core-Payload aus UI notwendig (CAP baut Payload intern via `aicore-proxy.js`)

Siehe `docs/ASK_QUESTION_API.md` für vollständige Curl-Verifikation und Fehlercodes.

### Story 1.2 — Serverseitiger Payload Builder
**Ziel:** CAP baut den bisherigen technischen Orchestration-Payload vollständig intern.

**Acceptance Criteria**
- [ ] `ragProfileId` wird auf `data_repositories` gemappt
- [ ] `templating_module_config` wird serverseitig erzeugt
- [ ] `llm_module_config` ist zentral konfigurierbar
- [ ] Historie-Handling ist serverseitig steuerbar

### Story 1.3 — Robustes Response-Handling
**Ziel:** Unterschiedliche Response-Shapes vom Provider werden in einheitlichen Contract überführt.

**Acceptance Criteria** _(#10, implemented)_
- [x] CAP extrahiert Antworttext robust aus bekannten Pfaden
- [x] Rückgabe folgt `AskQuestionResponse`-Schema
- [x] Fehlerpfade liefern User-safe Message + technischen Code

Siehe `docs/ASK_QUESTION_API.md` für `technicalCode`-Tabelle und Response-Shape-Doku.

---

## EPIC 2 — Answer Rendering & Citations (MVP)

### Story 2.1 — Antwortvertrag v1 implementieren
**Ziel:** Strukturierte Antwort inkl. Markdown + Plain-Text-Fallback.

**Acceptance Criteria**
- [ ] Response enthält `answer.format`, `answer.markdown`, `answer.plainText`
- [ ] `technicalCode` und `correlationId` sind immer gesetzt
- [ ] Contract ist versioniert und dokumentiert

### Story 2.2 — Citation Mapping
**Ziel:** Quellen aus RAG-Metadaten strukturiert zurückgeben.

**Acceptance Criteria**
- [ ] `citations[]` enthält `documentId`, `chunkId`, `page`, `score`, `uri` (falls verfügbar)
- [ ] Deduplizierung bei gleichen Quellen
- [ ] Bei fehlenden Metadaten: `citations=[]` statt Fehler

### Story 2.3 — UI5 Rendering Guidelines
**Ziel:** Sichere und konsistente Darstellung in UI5.

**Acceptance Criteria**
- [ ] Markdown wird zu HTML gerendert
- [ ] Sanitizing ist aktiv (XSS-Schutz)
- [ ] Fallback auf `plainText` bei Renderfehler
- [ ] Quellen werden separat visualisiert

---

## EPIC 3 — RAG Admin Dashboard (MVP)

### Story 3.1 — Dokument-Upload API
**Ziel:** Upload statt CLI über CAP möglich machen.

**Acceptance Criteria**
- [ ] Upload Action vorhanden
- [ ] MIME/Größe/Dateiname validiert
- [ ] Objekt wird im Object Store gespeichert
- [ ] Metadaten in `Documents` persistiert

### Story 3.2 — Dokumentliste & Lifecycle
**Ziel:** Dokumente anzeigen, filtern, löschen/archivieren.

**Acceptance Criteria**
- [ ] Liste liefert Status + zentrale Metadaten
- [ ] Soft-Delete ist möglich
- [ ] Hard-Delete Verhalten ist klar dokumentiert

### Story 3.3 — Ingestion Trigger + Status
**Ziel:** Reindex/Ingestion steuerbar und transparent.

**Acceptance Criteria**
- [ ] `triggerIngestion` Action verfügbar
- [ ] `IngestionJobs` mit Statusmaschine (`queued/running/succeeded/failed`)
- [ ] Fehlerursachen in `technicalMessage` nachvollziehbar

---

## EPIC 4 — Data Model & Persistence (MVP)

### Story 4.1 — CDS Modell finalisieren
**Ziel:** Entitäten stabil für Chat + Admin + Betrieb.

**Acceptance Criteria**
- [ ] `RagProfiles`, `Documents`, `IngestionJobs`, `Conversations`, `Messages`, `AuditLogs` final
- [ ] Technische Keys und Assoziationen geprüft
- [ ] Lösch- und Retention-Strategie dokumentiert

### Story 4.2 — Conversation Persistenz
**Ziel:** Chatverlauf serverseitig konsistent speichern.

**Acceptance Criteria**
- [ ] User- und Assistant-Nachrichten werden gespeichert
- [ ] `lastMessageAt` wird gepflegt
- [ ] Verlauf je Conversation abrufbar

---

## EPIC 5 — Observability & Reliability (MVP)

### Story 5.1 — Correlation + Error Contract
**Ziel:** Support-fähige Fehlerdiagnose.

**Acceptance Criteria**
- [ ] Jede Anfrage erhält `correlationId`
- [ ] Fehlerobjekt ist konsistent über alle Actions
- [ ] Logeinträge enthalten `correlationId` und `technicalCode`

### Story 5.2 — Idempotenz und Retry-Regeln
**Ziel:** Doppelläufe und inkonsistente Zustände vermeiden.

**Acceptance Criteria**
- [ ] Upload kann über Checksumme dedupliziert werden
- [ ] Trigger-Operationen sind idempotent oder klar abgegrenzt
- [ ] Retry-Regeln für transiente Fehler dokumentiert

---

## EPIC 6 — Security & Authorization (Phase 2)

### Story 6.1 — IAS/XSUAA Integration
**Ziel:** Login und Token-basierte Authentifizierung aktivieren.

**Acceptance Criteria**
- [ ] Services akzeptieren nur authentifizierte Requests
- [ ] Rollen/Scopes sind in Security-Artefakten definiert
- [ ] Lokaler Dev-Modus bleibt reproduzierbar dokumentiert

### Story 6.2 — Rollenmodell enforce
**Ziel:** `ChatUser`, `RagAdmin`, `SupportReadOnly` serverseitig durchsetzen.

**Acceptance Criteria**
- [ ] `@requires/@restrict` final auf allen relevanten Actions/Entities
- [ ] Negativtests für unberechtigte Zugriffe vorhanden
- [ ] Audit-Logs für Admin-Aktionen aktiv

---

## EPIC 7 — Release Readiness

### Story 7.1 — Contract Tests
**Ziel:** API-Stabilität bei Änderungen sicherstellen.

**Acceptance Criteria**
- [ ] Schema-Tests für `askQuestion` Response inkl. `citations[]`
- [ ] Fehlerfall-Tests für alle Kern-Actions
- [ ] Breaking-Change-Erkennung in CI

### Story 7.2 — Runbook & Betriebsdoku
**Ziel:** Support-/Betriebsteam handlungsfähig machen.

**Acceptance Criteria**
- [ ] Fehlercodes -> Maßnahmen dokumentiert
- [ ] Troubleshooting für Upload/Ingestion/AI-Core enthalten
- [ ] Betriebsgrenzen MVP vs. Phase 2 klar beschrieben

---

## Priorisierung (empfohlen)

### MVP (sofort)
1. EPIC 1
2. EPIC 2
3. EPIC 3
4. EPIC 4
5. EPIC 5

### Danach (Phase 2)
6. EPIC 6
7. EPIC 7

---

## Definition of Ready (DoR)

Eine Story startet erst, wenn:
- Ziel, AC und technische Abhängigkeiten klar sind
- betroffene API/Entity eindeutig benannt ist
- Testidee (Happy + Error Path) notiert ist

## Definition of Done (DoD)

Eine Story ist fertig, wenn:
- AC erfüllt und nachvollziehbar getestet sind
- Fehlercodes + Logging vorhanden sind
- Doku bei Contract-/Flow-Änderungen aktualisiert ist
- keine MVP/Phase-2-Grenze versehentlich verletzt wurde
