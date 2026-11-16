# Spinalytics

Explainable spinal-measurement analysis and vertebral anomaly localization, built on **synthetic data**.

Give it spinal measurements (a sample case, a CSV file, or typed values) and it compares every vertebra, disc and regional angle with a reference, marks the levels that stand out on a 3D spine and in a table, adds a separate whole-pattern model score, and says plainly when it cannot answer. An optional, strictly scoped AI assistant can explain a result in words.

> **Educational and research prototype. Not a medical device.** The reference, the model and every sample case come from a random generator. Nothing here says anything about real people, and nothing is a diagnosis.

Live site: _added after the first deployment (see "Deploy")_.

## What is in the box

| Part | What it does |
|---|---|
| `backend/` | FastAPI service: input validation, statistical comparison (difference, percentage, z-score, percentile, status per level), calibrated model with abstention and occlusion explanation, sample cases, optional assistant route |
| `frontend/` | React + TypeScript + Vite + Tailwind: landing page with scroll-driven 3D spine, sample / CSV / manual input with a review step, results with table, charts and linked 3D view, printable report |
| `backend/scripts/` | Reproducible data pipeline: dataset generator, validation gate, splits, reference distributions, calibration, model training |
| `docs/` | Data generation, data dictionary, model card, assistant design |
| `PLAYBOOK.md` | The phase-by-phase build plan with test tables and completion checkpoints |

## Run it locally

Requirements: Python 3.12, Node 22 or newer.

```bash
# backend (from the repository root)
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt      # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                                                       # http://localhost:5173
```

The trained model and reference are committed, so the app runs without regenerating anything. The optional assistant needs a Gemini key: copy `.env.example` to `.env` in the repository root and fill in `GEMINI_API_KEY`. `.env` is git-ignored. Without a key the assistant button is replaced by a note and everything else works.

## Regenerate the data and artifacts

The dataset (50,000 synthetic rows, 221 columns) is not stored in Git; the generator is. From `backend/`:

```bash
.venv/Scripts/python scripts/generate_dataset.py          # data/spinalytics_dataset.csv (identical every time)
.venv/Scripts/python scripts/validate_dataset.py          # 12 quality checks; exits non-zero on failure
.venv/Scripts/python scripts/make_splits.py               # fixed 70/15/15 stratified split
.venv/Scripts/python scripts/build_reference.py           # healthy-like reference distributions
.venv/Scripts/python scripts/calibrate_overall_rule.py    # overall rule limits, from validation rows only
.venv/Scripts/python scripts/train_model.py               # model, metrics and docs/MODEL_CARD.md
```

Details are in `docs/DATA_GENERATION.md` and `docs/DATA_DICTIONARY.md`.

## Test it

```bash
# backend: needs the dataset and splits from the first three commands above
cd backend && .venv/Scripts/python -m pytest -q

# frontend unit tests, then end-to-end and accessibility checks in a real browser
cd frontend
npm run test:unit
npx playwright install chromium        # once; or set PW_CHANNEL=chrome to use an installed Chrome
npm run e2e                            # starts the API and the built app itself
npm run test:all                       # unit + e2e
```

## Deploy

- **Backend (Render, free tier):** `render.yaml` describes the service. Create a Blueprint from the repository, then set `GEMINI_API_KEY` (secret) and `ALLOWED_ORIGINS` (the Vercel address) in the dashboard. The first request after idle takes up to a minute; the app shows a "waking the server" message.
- **Frontend (Vercel):** import the repository with root directory `frontend`, framework Vite, and set `VITE_API_BASE_URL` to the Render address. `frontend/vercel.json` makes deep links work.

The key is never added to the frontend or to Vercel.

## Honest limits

- All data are synthetic. Thresholds (z up to 2 within reference, 2 to 3.5 review, above 3.5 larger deviation) are demonstration values, not clinical cut-offs.
- The model score is not the probability of disease. The model abstains when measurements are missing or unlike anything it learned from.
- C1 and C2 are drawn but not measured.
- Results are session-only: nothing is stored on the server or in browser storage.
- The assistant's topic gate is rule-based and imperfect by design; see `docs/AI_ASSISTANT.md`.

Fonts (Fraunces, IBM Plex) and libraries are listed with their licences in `docs/THIRD_PARTY.md`.
