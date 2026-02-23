# BTP CAP RAG Admin Hub

Projektplanung für ein CAP-basiertes Backend + UI5-Adminoberfläche zur Verwaltung von RAG-Trainingsdaten im SAP BTP Object Store und zur Bereitstellung einer schlanken Chat-API für UI5.

> Status: **CAP proxy baseline scaffolded** – lokale Entwicklungsumgebung lauffähig.
>
> **MVP-Entscheidung:** Start **ohne Login/Auth/Rollen** (bewusst vereinfacht zur Fehlerminimierung). Security-Härtung mit IAS/XSUAA + Rollen folgt als Phase 2.

## Setup & Run

### Voraussetzungen

- Node.js ≥ 18
- `@sap/cds-dk` wird über `devDependencies` mitinstalliert (kein globales Install nötig)

### Installation

```bash
npm install
```

### Lokaler Start (ohne BTP-Destination)

```bash
CHATBOT_FORCE_LOCAL_FALLBACK=true npm start
```

Der Server startet auf **http://localhost:4004**.

| Endpunkt | Beschreibung |
|---|---|
| `GET /health` | Liveness-Check → `{"ok":true}` |
| `POST /odata/v4/chat/askQuestion` | Chat-Aktion (fragt AI Core / Fallback) |
| `GET /odata/v4/chat/Conversations` | Konversationsliste (OData) |
| `GET /odata/v4/rag-admin/RagProfiles` | RAG-Profile (OData) |
| `GET /odata/v4/rag-admin/Documents` | Dokumente (OData) |
| `POST /v2/<path>` | Raw-Proxy → SAP AI Core (BTP Destination) |

### Mit echter BTP-Destination

Lege eine `.cdsrc-private.json` (per `.gitignore` ausgeschlossen) an:

```json
{
  "requires": {
    "AI_CORE_REST_CONN": {
      "kind": "rest",
      "credentials": {
        "url": "https://<ai-core-base-url>"
      }
    }
  }
}
```

Setze außerdem:

```bash
export AI_CORE_DESTINATION_NAME=AI_CORE_REST_CONN
export AI_CORE_ORCHESTRATION_ENDPOINT=/v2/inference/deployments/<deployment-id>/completion
export AI_CORE_VECTOR_REPOSITORY_ID=<repository-uuid>
export AI_RESOURCE_GROUP=default
npm start
```

### CDS kompilieren (Lint)

```bash
npm run lint
```

### Schnell-Test nach Start

```bash
curl http://localhost:4004/health
# → {"ok":true,"service":"btp-cap-rag-admin-hub"}

curl -s http://localhost:4004/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{"question":"Was ist ein RAG-Profil?"}' | jq .
```

## Zielbild

- UI5-Chatapp sendet nur fachliche Inputs (Frage, RAG-Profil, Conversation-Referenz)
- CAP kapselt den kompletten AI-Core-Orchestration-Payload
- Admins verwalten Dokument-Uploads, Metadaten, Indexierung und Lifecycle über ein Dashboard
- User-spezifischer Chatverlauf wird im CAP-Backend gespeichert (rollen- und datenschutzkonform)

## Scope (Phase 1)

- CAP proxy baseline (dieses Repo, lauffähig)
- Architektur- und API-Konzept
- CDS-Datenmodell (`db/schema.cds`) und Service-Definitionen (`srv/`)
- Rollenmodell (User/Admin/Support) – vorbereitet, noch inaktiv
- Projektplan (Milestones, Deliverables, Risiken)

## Inhalte im Repo

### Backend (implementiert)

| Datei | Beschreibung |
|---|---|
| `server.js` | CAP-Einstiegspunkt: Health-Endpoints + raw `/v2`-Proxy zu AI Core |
| `srv/chat-service.cds` | `ChatService` CDS-Definition (askQuestion, Conversations, Messages) |
| `srv/chat-service.js` | `ChatService` Implementierung (AI Core Orchestration + lokaler Fallback) |
| `srv/rag-admin-service.cds` | `RagAdminService` CDS-Definition (upload, ingest, delete, Entities) |
| `srv/rag-admin-service.js` | `RagAdminService` Stubs (Phase 2) |
| `srv/aicore-proxy.js` | Orchestration-Payload-Builder + Reply-Parser für SAP AI Core |
| `db/schema.cds` | Vollständiges CDS-Datenbankschema (alle Entitäten) |

### Planung & Design (Referenz)

- `docs/PROJECT_PLAN.md` – Projektplanung inkl. Milestones
- `docs/ARCHITECTURE.md` – Zielarchitektur, Security, Betriebsmodell
- `design/cds/schema.cds` – ursprünglicher CDS-Entwurf (Referenz)
- `design/cds/services.cds` – ursprünglicher Service-Entwurf (Referenz)
- `design/api/contract-examples.md` – Request/Response-Beispiele
- `docs/PRE_DEV_CHECKLIST.md` – Vorbereitungscheckliste
- `docs/ANSWER_RENDERING_AND_CITATIONS.md` – Formatierungs- und Rendering-Konzept
- `docs/FEASIBILITY_AND_FUTURE_PROOFING.md` – Machbarkeit, SAP-Fit, Erweiterbarkeit
- `docs/PAYLOAD_BASELINE_FROM_UI5_ONLY.md` – Ist-Payload-Mapping
- `docs/BACKLOG_EPICS_AND_STORIES.md` – Epic/Story-Backlog

## Nächster Schritt

Object Store-Integration + AI Core Ingestion in `RagAdminService` (Phase 2).
