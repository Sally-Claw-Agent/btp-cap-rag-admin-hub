# Payload Baseline aus bestehender UI5-only Chatbot App

Quelle: `phoron-ui5-only-chatbot/webapp/controller/main.controller.js` und `ChatDesignV2.controller.js`

Ziel dieses Dokuments:
- Den **aktuellen technischen Ist-Payload** sauber dokumentieren
- Die Abhängigkeiten aus dem Controller festhalten
- Das Mapping auf den neuen schlanken CAP-Vertrag ableiten

---

## 1) Aktueller Endpoint-Aufruf (Ist)

UI5 ruft direkt auf:

- `POST /v2/inference/deployments/d0246f61c3352271/completion`
- Header:
  - `Content-Type: application/json`
  - `AI-Resource-Group: default`

## 2) Aktueller Request-Body (Ist)

```json
{
  "orchestration_config": {
    "module_configurations": {
      "grounding_module_config": {
        "type": "document_grounding_service",
        "config": {
          "filters": [
            {
              "id": "filter1",
              "search_config": { "max_chunk_count": 6 },
              "data_repositories": ["<repoId>"],
              "data_repository_type": "vector"
            }
          ],
          "input_params": ["grounding_input_variable_1"],
          "output_param": "grounding_output_variable"
        }
      },
      "templating_module_config": {
        "template": [
          { "role": "system", "content": [{ "type": "text", "text": "...Prompt..." }] },
          { "role": "user", "content": [{ "type": "text", "text": "...few-shot..." }] },
          { "role": "assistant", "content": [{ "type": "text", "text": "...few-shot..." }] },
          { "role": "user", "content": [{ "type": "text", "text": "UserQuestion: {{?grounding_input_variable_1}}, Context: {{?grounding_output_variable}}" }] }
        ],
        "defaults": { "grounding_input_variable_1": "" }
      },
      "llm_module_config": {
        "model_name": "gemini-2.0-flash-lite",
        "model_params": {
          "max_output_tokens": 1024,
          "temperature": 0.1
        },
        "model_version": "001"
      }
    }
  },
  "input_params": {
    "grounding_input_variable_1": "<user-input>"
  }
}
```

---

## 3) Dynamische Werte aus UI5-Controller

## main.controller.js

- `repoId` kommt aus Repository-Auswahl im UI-Modell (`selectedRepositoryKey -> repositories[].repoId`)
- Conversation-Historie wird teilweise in Template injiziert (`_buildConversationHistory`) mit Tokenbudget (~400)
- User-Frage landet in `input_params.grounding_input_variable_1`

## ChatDesignV2.controller.js

- Nutzt aktuell einen fixen `data_repositories` Wert (`c58a8c87-f12d-4712-a791-2295640dafd8`)
- Kein dynamischer Repository-Switch im Payload
- Keine Conversation-History im Payload

---

## 4) Response-Parsing im Ist-Controller

Mehrere mögliche Pfade werden geprüft (`completion`, `result`, `output`, `choices[0]...`, `orchestration_result...`).

Konsequenz:
- Aktuell kein stabiler, versionierter Antwortvertrag
- UI muss mehrere Provider-/Shape-Varianten abfangen

---

## 5) Mapping auf Zielarchitektur (Soll)

## Neuer UI5 -> CAP Request (fachlich schlank)

```json
{
  "question": "<user-input>",
  "ragProfileId": "<uuid>",
  "conversationId": "<optional-uuid>"
}
```

## CAP intern (nicht UI-Vertrag)

CAP baut daraus den bisherigen Orchestration-Payload:
- `data_repositories` via `ragProfileId -> repositoryId` Mapping
- `templating_module_config` inkl. Prompt/Few-Shot
- `llm_module_config` zentral konfiguriert
- optionale Konversationshistorie serverseitig gesteuert

## CAP -> UI5 Response (vertraglich stabil)

- `answer.format`, `answer.markdown`, `answer.plainText`
- `citations[]` mit RAG-Metadaten
- `model`, `technicalCode`, `correlationId`

Siehe:
- `docs/ANSWER_RENDERING_AND_CITATIONS.md`
- `design/cds/services.cds`

---

## 6) Design-Entscheidungen, die aus dem Ist folgen

1. **Repository-Auswahl bleibt fachlich im UI sichtbar**, technische Repository-ID-Mappings gehen ins CAP.
2. **Prompt/Model/Orchestration-Konfig** wird vollständig ins CAP verlagert.
3. **Response-Normalisierung** findet serverseitig statt (UI rendert nur Vertrag).
4. **Controller-spezifische Parsing-Logik** in UI entfällt langfristig.

---

## 7) Offene Punkte vor Implementierung

- Soll Conversation-History serverseitig immer aktiv sein oder pro `ragProfile` konfigurierbar?
- Soll `AI-Resource-Group` statisch bleiben oder pro Profil steuerbar werden?
- Brauchen wir Modellwahl pro Profil (statt global)?
