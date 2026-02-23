# Answer Rendering & Citation Contract

## Warum das wichtig ist

Unformatierte LLM-Ausgaben führen zu schlechter UX, unklarer Nachvollziehbarkeit und erschweren Support. Daher wird Antwortdarstellung als **Backend/API-Vertrag** definiert — nicht als reine UI-Kosmetik.

## Leitprinzip (SAP-kompatibel)

1. **Prompting steuert Stil**, aber ist nicht alleinige Garantie.
2. **CAP normalisiert und validiert** das Ausgabeformat.
3. **UI5 rendert sicher** (sanitized) und zeigt Quellen separat/strukturiert.
4. **Antwort + Quellen** sind als stabile API-Version definiert.

---

## Zielvertrag für `askQuestion`

### Request (minimal)

- `question`
- `ragProfileId`
- optional `conversationId`

### Response (strukturierte Ausgabe)

```json
{
  "conversationId": "uuid",
  "messageId": "uuid",
  "answer": {
    "format": "markdown",
    "markdown": "## Ergebnis\n\n- Punkt 1\n- Punkt 2\n\nMehr: https://example.org",
    "plainText": "Ergebnis: Punkt 1, Punkt 2, Mehr: https://example.org"
  },
  "citations": [
    {
      "id": "cit-1",
      "title": "S4_Process_Guide.pdf",
      "sourceType": "object-store-document",
      "documentId": "uuid",
      "chunkId": "chunk-0012",
      "page": 14,
      "uri": "https://...",
      "score": 0.87
    }
  ],
  "model": {
    "name": "...",
    "latencyMs": 1240
  },
  "technicalCode": "OK",
  "correlationId": "req-..."
}
```

---

## Rollen der Schichten

## A) System Prompt (LLM)

Prompt-Regeln:
- Antworte in **Markdown**
- Nutze Überschriften/Listen sparsam und konsistent
- Keine erfundenen Quellen
- Wenn unklar: Unsicherheit transparent markieren

**Aber:** Prompt ist nur Guidance, keine harte Validierung.

## B) CAP Response Normalization

CAP macht serverseitig:
- Markdown-Basiskorrekturen (Listen/Absätze)
- URL-Erkennung und Normalisierung
- Leere/duplizierte Quellen entfernen
- Zitationsblock aus RAG-Metadaten ergänzen (wenn vorhanden)
- Fallback auf `plainText`, falls Markdown defekt

Nicht erlaubt in CAP:
- Inhaltlich neue Fakten „schönformatiert erfinden“

## C) UI5 Rendering (sicher)

- Markdown -> HTML Rendering
- Danach Sanitizing (XSS-Schutz)
- Links klickbar + optional extern-Icon
- Quellen als eigener Abschnitt (List/Panel), nicht im Fließtext verstecken
- Fallback: Wenn Rendering fehlschlägt, `plainText` anzeigen

Hinweis SAP/UI5:
- Bei HTML-Darstellung Sanitizer konsequent aktivieren (SAPUI5 HTML Sanitizer Guidance)

---

## Fehlertoleranz & Qualitätsregeln

### Mindestqualität pro Antwort
- Mindestens ein lesbarer Absatz
- Keine kaputten Markdown-Tokens im finalen Render
- Technischer Code und Correlation-ID vorhanden
- Wenn RAG-Metadaten da sind: mindestens 1 Citation zurückgeben

### Graceful Degradation
- Keine Quellen verfügbar -> Antwort trotzdem liefern, aber `citations=[]`
- Markdown unbrauchbar -> `plainText` rendern
- URL unklar -> als Text stehen lassen, nicht blind verlinken

---

## Erweiterbarkeit / Zukunftssicherheit

Folgende Erweiterungen sind kompatibel ohne Breaking Change:

1. `format: "markdown" | "html" | "json-blocks"`
2. Zitations-Typen (`kb`, `pdf`, `web`, `ticket`, `code`)
3. UI-Blocks (z. B. `callout`, `table`, `steps`) als optionales Feld
4. Confidence-/Grounding-Metriken je Citation
5. Streaming-Antworten (`delta`) mit finalem Normalisierungsabschluss

---

## SAP-nahe Umsetzungsstrategie

- CAP Action mit **strukturiertem Return Type** (statt nur freiem Text)
- OData-konformer Vertrag, versioniert (`v1`, später `v2`)
- Observability: pro Anfrage Korrelation, technische Codes, Laufzeit
- Security-Härtung in Phase 2 (MVP bleibt bewusst ohne Auth)

---

## Entscheider-Check vor Implementierung

- Ist die Response-Struktur final abgestimmt?
- Ist klar, welche RAG-Metadaten tatsächlich aus AI Core kommen?
- Ist UI-Sanitizing technisch vorgesehen und getestet?
- Ist Fallback-Verhalten (`plainText`) verbindlich?
