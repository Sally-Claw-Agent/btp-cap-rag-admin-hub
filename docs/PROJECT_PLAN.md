# Projektplan — BTP CAP RAG Admin Hub

## 1) Ausgangslage

Aktuell erfolgt der Upload von RAG-Trainingsdateien in den BTP Object Store primär über CLI/Console-Flows. Das ist für Betrieb und Administration unkomfortabel, schlecht auditierbar und fehleranfällig.

Zusätzlich sendet die bestehende UI5-Chatapp einen umfangreichen technischen Payload in Richtung AI Core Proxy. Ziel ist eine fachlich schlanke API.

## 2) Projektziele

## MVP-Guardrail (wichtig)

- **MVP läuft bewusst ohne Login/Auth/Rollen.**
- Ziel: Integrations- und Datenflussfehler früh isolieren (Upload, Ingestion, Ask-Flow, Persistenz).
- Security-Features (IAS/XSUAA, Rollen, Scopes, App Router Policies) werden explizit in **Phase 2** geplant und umgesetzt.
- Einschränkung: MVP nur in nicht-produktiver, kontrollierter Umgebung verwenden.

### Primärziele

1. **Admin-Fähigkeit schaffen:** Dokumente für RAG über UI verwalten statt CLI-only.
2. **Backend entkoppeln:** Komplexe AI-Orchestration in CAP kapseln.
3. **Konsistente Datenbasis:** Dokument- und Chat-Metadaten zentral speichern.
4. **Security & Compliance:** Rollenmodell, Auditbarkeit, Datenminimierung.

### Messbare Erfolgskriterien (DoD auf Planungsebene)

- Fachliche API beschreibt nur notwendige Inputs (`question`, `ragProfileId`, optional `conversationId`)
- Vollständiger Service-Katalog für Admin-Aufgaben vorhanden
- Rollenmatrix inkl. Berechtigungen dokumentiert
- End-to-End-Prozess für Upload → Ingestion → Status sichtbar beschrieben
- Datenschutz- und Retention-Ansatz dokumentiert

## 3) Funktionskatalog

### A. Chat (User)

- Frage stellen (`askQuestion`)
- Antwort inkl. Referenzen/Metadaten erhalten
- Conversation-Verlauf laden
- User-spezifische Historie speichern

### B. RAG-Administration (Admin)

- Dokument hochladen (Datei + Metadaten)
- Dokumente auflisten/filtern
- Dokument löschen/archivieren
- Ingestion/Reindex triggern
- Ingestion-Status und Fehler einsehen

### C. Betrieb/Support

- Audit-Log für Admin-Aktionen
- Fehlercodes + technische Korrelation (Trace-ID)
- Monitoring-relevante Zustände (queued/running/succeeded/failed)

## 4) Ziel-Nichtziele

- Kein Ersatz für AI Launchpad-Funktionalität
- Kein eigenes Embedding-/Retriever-Framework
- Kein komplexes IAM-Neudesign außerhalb BTP-Standards

## 5) Arbeitspakete / Milestones

## Milestone M1 — Architektur & API (Planung)

- Zielarchitektur finalisieren
- CDS-Domänenmodell entwerfen
- Service-Definitionen dokumentieren
- Rollenmodell und Security-Entscheidungen festhalten

**Lieferobjekte:**
- `docs/ARCHITECTURE.md`
- `design/cds/schema.cds`
- `design/cds/services.cds`
- API-Beispiele

## Milestone M2 — MVP-Umsetzung (ohne Auth)

- CAP-Implementierung Kernflows (Ask, Upload, List, Delete, Trigger Ingestion)
- UI5-Admin-Implementierung Kernflows
- Stabilitätsfokus: technische Fehlerbehandlung, Retries, Idempotenz
- Testkonzept für MVP (Unit/Integration/UAT light)

## Milestone M3 — Security/Identity (Phase 2)

- IAS/XSUAA aktivieren
- Rollen-/Scope-Modell produktionsreif umsetzen
- App Router + Zugriffspfade härten
- Autorisierungs- und Penetrationstest-Scope definieren

## Milestone M4 — Härtung & Rollout

- Observability (Logs, Korrelation, Metrics)
- Datenschutz/Retention finalisieren
- Pilotbetrieb

## 6) Risiken & Gegenmaßnahmen

- **R1: Unscharfe Verantwortlichkeit Chat vs. Admin**
  - Maßnahme: Zwei Services in einer CAP-App, klare Rollen.
- **R2: Große Dateien / Timeouts beim Upload**
  - Maßnahme: Optional pre-signed URLs, Async-Ingestion.
- **R3: Fehlende Nachvollziehbarkeit**
  - Maßnahme: Audit-Entity + technische Request-ID.
- **R4: Datenschutzrisiken bei Chat-Historie**
  - Maßnahme: Retention-Policy, Lösch-Action, User-Isolation.

## 7) Empfehlung

Eine **einzige CAP-App** mit logisch getrennten Services (`ChatService`, `RagAdminService`) ist für den aktuellen BTP-Kontext der pragmatische Best-Practice-Ansatz. Separate CAP-Apps erst bei harten organisatorischen/SLA-Grenzen.
