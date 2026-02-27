# PostgreSQL Deploy & Ops Runbook

Dieses Dokument beschreibt alle Schritte, um das CAP-Backend mit PostgreSQL auf BTP Cloud Foundry zu deployen, inkl. lokale Entwicklung, BTP-Konfiguration und Smoke Tests.

---

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│  BTP Cloud Foundry Space                                        │
│                                                                 │
│  ┌──────────────────────────┐    ┌─────────────────────────┐   │
│  │  btp-cap-rag-admin-hub-  │    │  btp-cap-rag-admin-hub- │   │
│  │  backend (Node.js)       │───▶│  postgresql             │   │
│  │  port: auto (CF)         │    │  (postgresql-db service) │   │
│  └──────────────────────────┘    └─────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────┐                                   │
│  │  btp-cap-rag-admin-hub-  │  CF Task (einmalig bei Deploy)   │
│  │  pg-deployer             │───▶ führt `cds-deploy` aus       │
│  │  (no-route, no-start)    │    (Schema-Init / Migration)      │
│  └──────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Profile:**

| Umgebung | DB-Kind | Aktivierung |
|---|---|---|
| `development` (local) | SQLite (`rag-admin.db`) | Standard, kein Flag nötig |
| `production` (CF) | PostgreSQL (BTP Binding) | `NODE_ENV=production` (CF setzt automatisch) |

---

## Lokale Entwicklung (SQLite)

### Starten

```bash
npm install
npm run watch          # cds watch – hot reload, SQLite
# oder
npm run start          # cds-serve, einmalig
```

Der Server startet auf **http://localhost:4004**.

### Sicherstellen, dass SQLite aktiv ist

```bash
npx cds env requires.db
# Erwartet: { kind: 'sqlite', credentials: { url: 'rag-admin.db' } }
```

### Lokale Entwicklung gegen PostgreSQL (optional, Docker)

Für lokale Tests mit PostgreSQL eine Datei `.cdsrc-private.json` (wird nicht committed) anlegen:

```json
{
  "requires": {
    "db": {
      "[pg]": {
        "kind": "postgres",
        "credentials": {
          "host": "localhost",
          "port": 5432,
          "user": "postgres",
          "password": "postgres",
          "database": "ragadmin"
        }
      }
    }
  }
}
```

PostgreSQL lokal starten:

```bash
docker run -d --name pg-local \
  -e POSTGRES_DB=ragadmin \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16
```

CAP mit pg-Profil starten:

```bash
cds watch --profile pg
```

---

## BTP-Konfiguration (einmalig, durch Marcel)

### Voraussetzungen

- CF CLI installiert und angemeldet: `cf login -a <api-url> --sso`
- Zugriff auf den richtigen BTP Space (Subaccount → Space)
- `postgresql-db` Service im CF Marketplace verfügbar: `cf marketplace -e postgresql-db`

### 1) PostgreSQL Service-Instanz anlegen

Je nach Account-Typ den passenden Plan wählen:

| Account-Typ | Plan |
|---|---|
| BTP Trial | `trial` |
| BTP PAYG (Free Tier) | `free` |
| BTP PAYG / CPEA (paid) | `development` oder `standard` |

```bash
# Trial-Accounts:
cf create-service postgresql-db trial btp-cap-rag-admin-hub-postgresql

# PAYG Free Tier:
cf create-service postgresql-db free btp-cap-rag-admin-hub-postgresql
```

> Der Service-Instanzname **muss** exakt `btp-cap-rag-admin-hub-postgresql` heißen,
> da er so in `mta.yaml` referenziert ist.

Service-Status prüfen (kann 1-5 Min. dauern):

```bash
cf service btp-cap-rag-admin-hub-postgresql
# Status: "create succeeded"
```

### 2) MTA build und deploy

```bash
# Im Root des Repos:
npm run build
# entspricht: npm install && cds build --production && mbt build --mtar archive

cf deploy mta_archives/archive.mtar --retries 1
```

Beim Deploy:
1. `btp-cap-rag-admin-hub-pg-deployer` startet als CF Task und führt `cds-deploy` aus (Schema-Init / Migration).
2. `btp-cap-rag-admin-hub-backend` startet als normale CF App (bindet PostgreSQL automatisch via VCAP_SERVICES).

### 3) Plan anpassen (wenn nötig)

Wenn ein anderer Plan als `trial` benötigt wird, muss `mta.yaml` angepasst werden:

```yaml
# mta.yaml – Resource btp-cap-rag-admin-hub-postgresql
parameters:
  service: postgresql-db
  service-plan: free   # oder "development", "standard"
```

---

## CF Deploy Details

### Was `cds build --production` erzeugt

```
gen/
  srv/                    ← CAP App Server (compiled CDS + JS handlers)
    package.json          ← App-Server-Dependencies
    srv/csn.json          ← compiled schema
    ...
  pg/                     ← PostgreSQL Deployer (CF Task)
    package.json          ← kopiert aus pg-package.json (im before-all Schritt)
    db/csn.json           ← Schema für cds-deploy
    db/data/              ← CSV seed data (falls vorhanden)
```

### Schema-Migration

`@cap-js/postgres` verwaltet die Schema-Evolution automatisch:
- Beim ersten Deploy: alle Tabellen werden erstellt.
- Bei Folge-Deploys: `ALTER TABLE` für neue Felder, neue Tabellen werden angelegt.
- **Keine manuelle Migration nötig** (kein Liquibase/Flyway).

Das Deployer-Modul in `mta.yaml` ist `no-start: true` — es läuft **nur** als einmaliger CF Task, nicht als dauerhafter Prozess.

---

## Smoke Tests nach Deploy

### 1) App-URL ermitteln

```bash
cf app btp-cap-rag-admin-hub-backend | grep routes
# z.B. btp-cap-rag-admin-hub-backend.cfapps.eu10.hana.ondemand.com
```

### 2) Health-Check

```bash
curl https://<app-url>/health
# Erwartet: { "status": "OK" }
```

### 3) OData-Metadaten

```bash
curl https://<app-url>/odata/v4/chat/$metadata | head -5
# Erwartet: <?xml version="1.0" ...

curl https://<app-url>/odata/v4/rag-admin/$metadata | head -5
# Erwartet: <?xml version="1.0" ...
```

### 4) RagProfiles lesen (persistiert in PostgreSQL)

```bash
curl https://<app-url>/odata/v4/rag-admin/RagProfiles
# Erwartet: { "@odata.context": "...", "value": [] }
```

### 5) Chat-Action (mit AI Core Env Vars gesetzt)

```bash
curl -X POST https://<app-url>/odata/v4/chat/askQuestion \
  -H "Content-Type: application/json" \
  -d '{"question":"Was ist SAP BTP?","ragProfileId":"default"}'
# Erwartet: { answer: { ... } } oder AI-Core-Fehler (wenn nicht konfiguriert)
```

### 6) Deployer-Task Status prüfen

```bash
cf tasks btp-cap-rag-admin-hub-pg-deployer
# Erwartet: SUCCEEDED für "deploy-to-postgresql"
```

---

## Env Vars für AI Core (CF App Environment)

Diese Variablen müssen nach dem Deploy im CF App Environment gesetzt werden
(oder via BTP User-Provided Service):

```bash
cf set-env btp-cap-rag-admin-hub-backend AI_CORE_ORCHESTRATION_ENDPOINT "https://<ai-core-url>/..."
cf set-env btp-cap-rag-admin-hub-backend AI_CORE_VECTOR_REPOSITORY_ID "<uuid>"
cf set-env btp-cap-rag-admin-hub-backend AI_RESOURCE_GROUP "default"
cf set-env btp-cap-rag-admin-hub-backend AI_MODEL_NAME "gpt-4o"
# Nach set-env: App neu starten
cf restart btp-cap-rag-admin-hub-backend
```

Vollständige Liste aller Env Vars: siehe `MEMORY.md` Abschnitt "Env Vars for AI Core".

---

## Troubleshooting

### PostgreSQL Binding nicht gefunden

**Symptom:** `Error: Cannot find module for db service`

**Ursache:** VCAP_SERVICES enthält kein gültiges `postgresql-db`-Binding.

**Diagnose:**
```bash
cf env btp-cap-rag-admin-hub-backend | grep postgresql
```

Wenn leer: Service-Instanz prüfen (`cf services`) und sicherstellen, dass die App das Binding in `mta.yaml` hat.

### Schema-Deployer schlägt fehl

```bash
cf tasks btp-cap-rag-admin-hub-pg-deployer
# Status anzeigen

cf logs btp-cap-rag-admin-hub-pg-deployer --recent
# Logs des letzten Task-Runs
```

Deployer manuell neu starten:
```bash
cf run-task btp-cap-rag-admin-hub-pg-deployer "npm start" --name redeploy-pg
```

### Lokale SQLite DB zurücksetzen

```bash
rm -f rag-admin.db rag-admin.db-shm rag-admin.db-wal
npm run watch   # cds watch initialisiert DB neu
```
