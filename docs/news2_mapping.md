# NEWS2 mapping (MIMIC-IV ICU)

This application exposes an aggregate **National Early Warning Score (NEWS)** aligned with UK Royal College of Physicians NEWS2 charts (total **0–20**). Clinical bands on the total score:

| Total score | Band   |
| ----------- | ------ |
| 0–4         | Low    |
| 5–6         | Medium |
| ≥7          | High   |

## Parameters and MIMIC `itemid`s

Implementation: `backend/services/news.py`. Vitals are taken from the **last 24 hours** of charted data for the ICU stay (`get_vitals_last24h`).

| NEWS parameter   | MIMIC itemids (examples) | Notes |
| ---------------- | ------------------------- | ----- |
| Respiratory rate | `220210`                  | Last value in window |
| SpO₂ (Scale 1)   | `220277`                  | Room-air Scale 1 scoring |
| Temperature      | `223761`                  | Values above 45 treated as °F and converted to °C |
| Systolic BP      | `220050`, `220179`, `225309` | Latest among NIBP / arterial systolic |
| Pulse            | `220045`                  | Heart rate |
| Consciousness    | —                         | **Default Alert (0 pts)** — structured ACVPU rarely available in chartevents; limitation flagged |

Supplemental oxygen is **detected** (not fully scored as NEWS2 Scale 2) using FiO₂ (`223834`) and O₂ flow (`227287`, `223848`). When present, limitations note that Scale 2 is not applied here.

## API

- `GET /api/news/{stay_id}` — full parameter breakdown, evidence strings, and limitations.
- `GET /api/stays` — each row includes `news_total` and `news_band` (computed or deterministic demo stub when vitals are insufficient).

## Honest gaps

- **Scale 2 SpO₂** is not fully automated; interpret SpO₂ with oxygen delivery per local protocol when FiO₂ / flow indicate support.
- **AVPU/ACVPU** is not reliably extracted from structured data; consciousness defaults to Alert with explicit limitation text.
- **Post-discharge watchlist**: NEWS on the watchlist is recomputed from **historical MIMIC chart windows** for that patient/stay — not a live feed.

## Ward capacity

Environment variable **`WARD_BED_CAPACITY`** (default `24`) sets configured bed count for occupancy ratio on `GET /api/ward/summary`. Census count reflects scanned ICU stays in the demo build, not necessarily a full hospital extract.
