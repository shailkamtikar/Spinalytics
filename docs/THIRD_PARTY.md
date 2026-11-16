# Third-party software and fonts

Nothing here was copied as source into the repository: every item is installed as a package. No component source was taken from a component gallery, and no image or 3D asset is used (the 3D spine is generated in code). The interaction patterns in `frontend/src/components/fx/` (word reveal, count-up, magnetic button, cursor spotlight, ticker, stagger, scroll progress) are original implementations on top of Motion, inspired by patterns popularised by Motion, 21st.dev and React Bits; none of their source was copied.

## Fonts (self-hosted through `@fontsource` packages)

| Font | Use | Licence |
|---|---|---|
| Fraunces (variable) | Display headings | SIL Open Font License 1.1 |
| IBM Plex Sans | Body text | SIL Open Font License 1.1 |
| IBM Plex Mono | Labels, numbers, captions | SIL Open Font License 1.1 |

## Frontend

| Package | Use | Licence |
|---|---|---|
| React, React DOM | UI | MIT |
| React Router | Routes | MIT |
| Vite, `@vitejs/plugin-react` | Build and dev server | MIT |
| Tailwind CSS | Styling | MIT |
| Motion | Scroll and reveal animation | MIT |
| Zustand | In-memory session state | MIT |
| Three.js, React Three Fiber, Drei | 3D spine | MIT |
| Recharts | Two charts | MIT |
| Papa Parse | CSV parsing in the browser | MIT |
| Vitest, Testing Library, jsdom | Unit tests | MIT |
| Playwright, axe-core | End-to-end and accessibility tests | Apache-2.0, MPL-2.0 |
| TypeScript | Type checking | Apache-2.0 |

## Backend

| Package | Use | Licence |
|---|---|---|
| FastAPI, Starlette, Pydantic, Uvicorn | API | MIT, BSD-3-Clause |
| NumPy, pandas, SciPy, scikit-learn, joblib | Statistics and model | BSD-3-Clause |
| slowapi | Rate limiting | MIT |
| google-genai | Optional assistant client | Apache-2.0 |
| pytest, httpx | Tests | MIT, BSD-3-Clause |

Licences are those published by each project at the time of writing; check a package's own repository for the authoritative text.
