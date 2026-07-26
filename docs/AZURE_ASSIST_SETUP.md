# Azure Foundry assist for Vide

Vide uses **Azure OpenAI / AI Foundry** only for **protocol mapping and paper extraction**.
Temperature time series always come from the **Rust Pennes bioheat solver**, optionally
**calibrated** against measured CSV data — never from the LLM.

## What you need from Azure

1. **Azure subscription** with AI Foundry or Azure OpenAI enabled (your $1000 credits work).
2. **One chat model deployment** — recommended: **`gpt-5-mini`**
   - It supports the Foundry **Responses API** endpoint and is appropriate for structured
     protocol extraction.
3. From the Azure portal / AI Foundry project, copy:
   - **Endpoint** — use the full endpoint shown on the deployment page, ending in
     `/openai/v1/responses`
   - **API key**
   - **Deployment name** (the name you gave the model, not the model SKU)

## Local setup

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Fill in `.env` at the repo root (loaded automatically by the Tauri app):

```env
VIDE_AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
VIDE_AZURE_OPENAI_API_KEY=your-key-here
VIDE_AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
```

3. Run the desktop app:

```bash
npm run tauri dev
```

4. In **Contacts → Literature protocol**, the badge should show **Azure · gpt-5-mini**.
   If it shows **Rules only**, the env vars were not picked up — restart the dev server
   after editing `.env`.

## Security notes

- API keys stay in **Rust** (Tauri backend). They are never sent to the React bundle.
- `.env` is gitignored. Do not commit keys.
- For production builds, set the same variables in the shell or a secure secret store
  before launching the app.

## What the assist layer does

| Capability | Azure required? | Output |
|------------|-----------------|--------|
| Keyword protocol match | No (rules fallback) | PMED / Mayrovitz parameters |
| NL protocol description | Yes (falls back to rules) | Structured stimulus params + warnings |
| Paper / methods extraction | Yes | Draft `ValidationCaseManifest` JSON |
| Temperature prediction | **Never** | Always Rust solver |
| Calibration | No | Grid search on `contactConductanceWM2K` |

## Accuracy workflow (what makes results match experiments)

The LLM alone cannot make Vide accurate. Accuracy requires:

1. **Correct protocol parameters** (assist helps here)
2. **Contact-site measured T(t) CSV** ingested beside a case manifest
3. **Calibration** on the calibration split only (`contactConductanceWM2K`)
4. **Hold-out evaluation** without refitting

See `docs/YC_DEMO_ROADMAP.md` Phase 1–3.

## Cost estimate (rough)

- Protocol suggestion: ~1–2k tokens → **low cost** per query on gpt-5-mini
- Paper extraction (full methods section): ~4–8k tokens → **~$0.02–0.05** per paper
- $1000 credits is ample for development, demos, and hundreds of extractions

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Rules only` badge | Check `.env` path (repo root), restart `tauri dev` |
| HTTP 401 | Wrong API key |
| HTTP 404 on deployment | Model/deployment name mismatch — use the exact name shown in Foundry |
| HTTP 429 | Rate limit — retry after a short delay |
| Azure fails, still get suggestion | Expected — rules fallback for reliability |

## API reference (Tauri commands)

- `assist_status` — configured?, deployment name, no secrets
- `assist_suggest_protocol` — `{ text, preferAzure }` → protocol suggestion
- `assist_extract_protocol` — `{ text, preferAzure }` → draft manifest (Azure only)
