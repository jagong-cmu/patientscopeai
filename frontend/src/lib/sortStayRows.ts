import type { StayListRow } from "../api/types";

export type StaySortField = "risk" | "news" | "age";
export type StaySortDir = "asc" | "desc";

/** Stable sort for roster tables; null risk/age sort last. */
export function sortStayRows(rows: StayListRow[], field: StaySortField, dir: StaySortDir): StayListRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (field === "risk") {
      const va = a.readmission_risk_72h;
      const vb = b.readmission_risk_72h;
      const ma = va == null || Number.isNaN(va);
      const mb = vb == null || Number.isNaN(vb);
      if (ma && mb) cmp = 0;
      else if (ma) cmp = 1;
      else if (mb) cmp = -1;
      else cmp = va - vb;
    } else if (field === "news") {
      cmp = a.news_total - b.news_total;
    } else {
      const aa = a.age_years;
      const bb = b.age_years;
      if (aa == null && bb == null) cmp = 0;
      else if (aa == null) cmp = 1;
      else if (bb == null) cmp = -1;
      else cmp = aa - bb;
    }
    if (cmp !== 0) return cmp * mul;
    return a.stay_id - b.stay_id;
  });
}
