# Architekturkonzept

## 1) High-Level

- **Frontend:** UI5 Chat App + optional UI5 Admin App
- **Backend:** CAP (Node.js) als zentrale Fassade
- **Integrationen:**
  - BTP Object Store (Dokumente)
  - SAP AI Core Proxy / AI Launchpad RAG-Service
  - BTP Identity (IAS/XSUAA) für AuthN/AuthZ
- **Persistenz:** SQL-DB (HANA Cloud oder PostgreSQL) für Metadaten/Verläufe

## 2) Service-Schnitt

### ChatService (für Endanwender)
- Entgegennahme minimaler Fachparameter
- Aufbau des technischen Orchestration Payloads
- Aufruf AI Core Proxy
- **Response-Normalisierung** (Markdown/Plain Fallback, Citation-Mapping)
- Normierte Antwort + Persistenz

### RagAdminService (für Admins)
- Upload/Lifecycle von Dokumenten
- Ingestion/Reindex triggern
- Status und Fehlercodes bereitstellen

## 3) Security-Grundsätze

### 3.1 MVP (Phase 1)

- Bewusst **ohne Login/Auth/Rollen** (nur Dev-/Testbetrieb).
- Kein direkter Object-Store-Key im Browser.
- CAP übernimmt sicherheitskritische Zugriffe serverseitig.
- Zugriffsschutz im MVP primär über Umgebung (separate Subaccount/Space, Netzwerkrestriktion, keine öffentliche Produktivfreigabe).

### 3.2 Zielzustand (Phase 2)

- IAS/XSUAA aktiv mit rollenbasiertem Modell:
  - `ChatUser`
  - `RagAdmin`
  - `SupportReadOnly` (optional)
- Tenant/User-Isolation über Token-Claims
- Harter Server-seitiger Authorization-Check pro Action/Entity

## 4) Datenfluss (vereinfachter Soll-Prozess)

1. Admin lädt Datei via UI5 hoch
2. CAP validiert Datei/MIME/Größe
3. CAP schreibt Datei in Object Store und Metadaten in DB
4. CAP triggert Ingestion im RAG-Service
5. CAP speichert Job-Status (`queued/running/succeeded/failed`)
6. UI zeigt Status live/polling an

## 5) Chatablauf

1. User sendet `question`, `ragProfileId`, optional `conversationId`
2. CAP prüft im MVP nur technische Eingaben/Profil (Autorisierung ab Phase 2)
3. CAP baut vollständigen AI-Orchestration Payload
4. CAP ruft AI Core Proxy auf
5. CAP speichert User-/Assistant-Nachricht im Verlauf
6. CAP liefert normalisierte Antwort an UI5

## 6) Betriebsaspekte

- Korrelations-ID pro Request (`x-correlation-id`)
- Audit-Trail für Admin-Aktionen (Upload/Delete/Reindex)
- Standardisierte Fehlerobjekte für UI (User-safe Message + technicalCode)
- Antwortformat als versionierter Vertrag (`answer.format`, `citations[]`)
- Sichere Darstellung in UI5 (Markdown-Rendering + Sanitizing)

## 7) Entscheidungsnotizen

- Eine CAP-App genügt aktuell; Services logisch trennen.
- Upload und Ingestion trennen (asynchron bevorzugt).
- Historie per Opt-in/Retention steuerbar machen.
