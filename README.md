# BTP CAP RAG Admin Hub

Projektplanung für ein CAP-basiertes Backend + UI5-Adminoberfläche zur Verwaltung von RAG-Trainingsdaten im SAP BTP Object Store und zur Bereitstellung einer schlanken Chat-API für UI5.

> Status: **Planung/Design only** (keine Implementierung gestartet)
>
> **MVP-Entscheidung:** Start **ohne Login/Auth/Rollen** (bewusst vereinfacht zur Fehlerminimierung). Security-Härtung mit IAS/XSUAA + Rollen folgt als Phase 2.

## Zielbild

- UI5-Chatapp sendet nur fachliche Inputs (Frage, RAG-Profil, Conversation-Referenz)
- CAP kapselt den kompletten AI-Core-Orchestration-Payload
- Admins verwalten Dokument-Uploads, Metadaten, Indexierung und Lifecycle über ein Dashboard
- User-spezifischer Chatverlauf wird im CAP-Backend gespeichert (rollen- und datenschutzkonform)

## Scope (Phase 1)

- Architektur- und API-Konzept
- CDS-Datenmodell-Entwurf
- Service-Definitionen (Chat + Admin)
- Rollenmodell (User/Admin/Support)
- Projektplan (Milestones, Deliverables, Risiken)

## Nicht im Scope (jetzt)

- Produktiver Code
- Deployment-Pipeline
- Laufende Integrationstests gegen produktive AI-Core-Umgebungen

## Inhalte im Repo

- `docs/PROJECT_PLAN.md` – Projektplanung inkl. Milestones
- `docs/ARCHITECTURE.md` – Zielarchitektur, Security, Betriebsmodell
- `design/cds/schema.cds` – CDS-Entwurf (konzeptionell)
- `design/cds/services.cds` – Service-Entwurf (Actions/Entities)
- `design/api/contract-examples.md` – Request/Response-Beispiele
- `docs/PRE_DEV_CHECKLIST.md` – Vorbereitungscheckliste vor Implementierungsstart

## Nächster Schritt

Nach Freigabe der Planung: technisches Setup der CAP-App und UI5-Adminoberfläche gemäß diesem Konzept.
