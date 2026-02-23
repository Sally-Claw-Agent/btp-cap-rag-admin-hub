# Feasibility, SAP-Fit & Future-Proofing Check

## Executive Summary

Das geplante Vorhaben ist **machbar** und **SAP-konform**, wenn die Umsetzung strikt in zwei Phasen erfolgt:

- **Phase 1 (MVP):** Funktionaler Kern ohne Auth (nur kontrollierte Non-Prod)
- **Phase 2:** Security-Härtung (IAS/XSUAA, Rollen, Policies)

Der Architekturansatz (UI5 thin client + CAP façade + Object Store + AI Core) entspricht dem typischen BTP-Vorgehen.

---

## 1) Machbarkeit je Baustein

### A) CAP als zentrale Fassade
- **Machbarkeit:** Hoch
- **Risiken:** Gering
- **Begründung:** CAP ist für servicezentrierte APIs, OData Actions und Integrationslogik geeignet.

### B) RAG-Admin (Upload/Index/Lifecycle)
- **Machbarkeit:** Hoch
- **Risiken:** Mittel (Dateigrößen, Timeouts, Async-Status)
- **Gegenmaßnahmen:** asynchrone Jobs, klare Statusmaschine, Retry-Regeln

### C) Strukturierte Antworten + Quellen
- **Machbarkeit:** Hoch
- **Risiken:** Mittel (LLM-Format variiert)
- **Gegenmaßnahmen:** serverseitige Normalisierung + Fallback auf PlainText

### D) User-Historie
- **Machbarkeit:** Hoch
- **Risiken:** Mittel (Retention/Datenschutz)
- **Gegenmaßnahmen:** Löschkonzept, Aufbewahrungsregeln, Phase-2-Security

---

## 2) SAP-Standards / Best Practices (Fit)

- Service-first (CAP Services, klare Actions)
- Entkopplung UI von technischem AI-Core-Payload
- Serverseitige Secrets und Integrationen
- Strukturierte Fehlerobjekte + Correlation IDs
- Schichtenprinzip: Prompting -> CAP Normalisierung -> UI Rendering

---

## 3) Zukunftssicherheit / Erweiterbarkeit

Vorhandene Entwurfsstärke:
- Trennbare Services (`ChatService`, `RagAdminService`)
- Versionierbarer API-Vertrag
- Erweiterbare Citation-Struktur
- Asynchrone Ingestion-States

Empfohlene nächste technische Optionen (kompatibel):
1. Streaming-Antworten (SSE/WebSocket) mit finalem post-processing
2. Block-basiertes Rendering (`json-blocks`) zusätzlich zu Markdown
3. Optionales Reranking/Scoring pro Citation
4. Prompt-Template-Verwaltung pro `RagProfile`
5. Contract-Tests (Schema Validation) als CI-Gate

---

## 4) Was vor Coding final entschieden werden sollte

1. Antwortvertrag v1 final einfrieren
2. Upload-Weg (direkt vs. pre-signed) nach Dateigröße definieren
3. Ingestion-Statusmodell inkl. Retry finalisieren
4. MVP-Betriebsgrenzen schriftlich festlegen (kein Produktivbetrieb)
5. Security-Phase-2 Scope inkl. Rollenmatrix terminieren

---

## 5) Red Flags (vermeiden)

- Nur Prompt für Formatierungsqualität verwenden (ohne Backend-Guardrails)
- Direkte HTML-Ausgabe ohne Sanitizing
- Direkter Browserzugriff auf Object-Store-Credentials
- Unversionierte, unstabile API-Rückgaben
- MVP unkontrolliert in produktionsnahen Umgebungen exponieren
