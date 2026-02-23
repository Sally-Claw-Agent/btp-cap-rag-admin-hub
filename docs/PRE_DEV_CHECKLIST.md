# Pre-Development Checklist (SAP-orientiert)

Ziel: Vor Start der Implementierung die wichtigsten Architektur- und Betriebsentscheidungen fixieren.

## A) MVP-Rahmen sauber festziehen

- [ ] MVP explizit als **nicht-produktiv** markieren (ohne Auth/Rollen)
- [ ] Technische Zugangsbeschränkung im BTP-Setup festlegen (separater Space/Subaccount, IP-Allowlist falls möglich)
- [ ] Feature-Flag definieren: `security.enabled=false` (MVP) / `true` (Phase 2)

## B) API/Domain-Klarheit

- [ ] `askQuestion` strikt minimal halten (`question`, `ragProfileId`, optional `conversationId`)
- [ ] Einheitliches Fehlerformat (`message`, `technicalCode`, `correlationId`)
- [ ] Idempotenz-Regel für Upload/Trigger festlegen (z. B. via Checksumme + Dokumentstatus)

## C) Upload & Ingestion

- [ ] Max. Dateigröße, erlaubte MIME-Typen, Dateinamenregeln definieren
- [ ] Entscheidung: direkter CAP-Upload vs. pre-signed URL für große Dateien
- [ ] Ingestion asynchron mit eindeutigen Zuständen (`queued/running/succeeded/failed`)
- [ ] Retry-Strategie und Dead-letter-Verhalten dokumentieren

## D) Daten & Lifecycle

- [ ] Metadatenmodell finalisieren (Dokument, Job, Profil, Conversation, Message)
- [ ] Löschstrategie: soft delete vs. hard delete je Entität
- [ ] Retention-Policy vorbereiten (für Phase 2/Prod)

## E) Observability

- [ ] Korrelations-ID in allen Flows erzwingen
- [ ] Strukturierte Logs für Upload/Ask/Ingestion
- [ ] Minimales Betriebsdashboard (Fehlerrate, Job-Laufzeiten, Queue-Länge)

## F) Security-Backlog (Phase 2)

- [ ] IAS/XSUAA Rollen/Scopes definieren
- [ ] @requires/@restrict je Action/Entity finalisieren
- [ ] Audit-Log für Admin-Aktionen verpflichtend
- [ ] Datenschutzprüfung für Chat-Historie (DSGVO: Auskunft/Löschung)

## G) SAP-Referenzen für die Umsetzung

- CAP Authentication Guide (cap.cloud.sap)
- SAP-samples `btp-cap-genai-rag` (Golden-Path-Inspiration)
- SAP Community Artikel zu CAP Media Handling/Object Store (als ergänzende Praxisbeispiele)

---

## Zusätzliche Ideen vor Entwicklungsstart

1. **RAG-Profil-Versionierung**
   - Profiländerungen versionieren (`profileVersion`) für reproduzierbare Antworten.

2. **Dokument-Qualitätsstatus**
   - Zusätzlich zu Ingestion: `validated`, `chunked`, `indexed`, `active`.

3. **Konfigurierbare Prompt-Templates pro Profil**
   - Nicht hart im Code, sondern in CAP-Config/DB verwaltet.

4. **Sicherer Dry-Run-Modus für Admin-Operationen**
   - Admin kann Upload/Index nur simulieren (ohne produktive Änderung).

5. **Technisches Runbook**
   - Fehlercodes → konkrete Operator-Aktion (z. B. "DOC_INVALID_MIME" => Format prüfen).
