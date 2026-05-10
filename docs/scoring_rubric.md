# Scoring rubric (historical)

The **custom four-component discharge readiness** engine described in earlier revisions has been **removed** from the product API.

The UI and backend now use **NEWS2-style aggregate scoring** from structured vitals. See:

- **[NEWS2 mapping (MIMIC itemids, limitations)](news2_mapping.md)**

Legacy endpoint `GET /api/readiness/{stay_id}` is no longer served; use **`GET /api/news/{stay_id}`**.
