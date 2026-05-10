/**
 * Approximate clinical reference intervals for ICU-charted vitals (MIMIC itemids).
 * Ranges adapt to age cohort (pediatric tables vs adult). Sex has minimal impact on these measures;
 * we do not adjust BP by sex here (avoids overstating precision).
 *
 * Temperature: values >45 are treated as °F and converted to °C for comparison (aligned with NEWS backend).
 */

export type VitalDemographics = {
  ageYears: number | null;
  gender: string | null;
};

export type VitalReferenceBand = {
  low: number;
  high: number;
  /** Short note shown in UI disclaimer */
  cohort: string;
};

export function normalizeTemperatureToCelsius(valuenum: number): number {
  if (valuenum > 45) {
    return ((valuenum - 32) * 5) / 9;
  }
  return valuenum;
}

/** MIMIC FiO₂ is usually a fraction (0.21); some extracts may store 21–100 as percent. */
export function normalizeFiO2Fraction(valuenum: number): number {
  if (valuenum > 1 && valuenum <= 100) return valuenum / 100;
  return valuenum;
}

type PedHrRr = { hr: [number, number]; rr: [number, number] };

function pediatricHrRr(ageYears: number): PedHrRr {
  if (ageYears < 1 / 12) return { hr: [100, 180], rr: [40, 65] };
  if (ageYears < 1) return { hr: [100, 160], rr: [30, 40] };
  if (ageYears < 3) return { hr: [90, 150], rr: [24, 40] };
  if (ageYears < 6) return { hr: [80, 140], rr: [23, 34] };
  if (ageYears < 12) return { hr: [70, 120], rr: [18, 30] };
  if (ageYears < 18) return { hr: [60, 100], rr: [12, 20] };
  return { hr: [60, 100], rr: [12, 20] };
}

function ageCohortLabel(ageYears: number | null): string {
  if (ageYears == null || Number.isNaN(ageYears)) return "adult default (age unknown)";
  if (ageYears < 18) return `pediatric (${ageYears.toFixed(1)} y)`;
  return `adult (${ageYears.toFixed(0)} y)`;
}

export function getVitalReferenceBand(
  itemid: number,
  demographics: VitalDemographics,
): VitalReferenceBand | null {
  const age = demographics.ageYears;
  const adult = age == null || age >= 18;
  const cohort = ageCohortLabel(age);

  // Heart rate
  if (itemid === 220045) {
    if (adult) return { low: 60, high: 100, cohort };
    const { hr } = pediatricHrRr(age ?? 12);
    return { low: hr[0], high: hr[1], cohort };
  }

  // Respiratory rate
  if (itemid === 220210) {
    if (adult) return { low: 12, high: 20, cohort };
    const { rr } = pediatricHrRr(age ?? 12);
    return { low: rr[0], high: rr[1], cohort };
  }

  // SpO₂ (%)
  if (itemid === 220277) {
    // Room-air–oriented normoxia band; supplemental O₂ limits interpretation (see UI disclaimer).
    return { low: 94, high: 100, cohort: adult ? "adult SpO₂ (room-air context)" : cohort };
  }

  // Temperature (°C after normalization)
  if (itemid === 223761) {
    return { low: 36.0, high: 37.5, cohort: `${cohort}; °C equivalent if chart is °F` };
  }

  // Systolic BP (NIBP / arterial)
  if (itemid === 220050 || itemid === 220179 || itemid === 225309) {
    if (adult) return { low: 90, high: 139, cohort };
    // Rough pediatric systolic lower bounds by age (mmHg), upper bound relaxed.
    if (age != null && age < 1) return { low: 65, high: 110, cohort };
    if (age != null && age < 10) return { low: 85, high: 125, cohort };
    if (age != null && age < 18) return { low: 90, high: 135, cohort };
    return { low: 90, high: 139, cohort };
  }

  // Diastolic
  if (itemid === 220051 || itemid === 220180) {
    if (adult) return { low: 60, high: 89, cohort };
    if (age != null && age < 10) return { low: 45, high: 75, cohort };
    if (age != null && age < 18) return { low: 55, high: 85, cohort };
    return { low: 60, high: 89, cohort };
  }

  // MAP
  if (itemid === 220052 || itemid === 220181) {
    return { low: 65, high: 105, cohort: `${cohort}; MAP targets vary by diagnosis` };
  }

  // FiO₂: MIMIC stores fraction (room air ≈0.21). Shade common ICU support band.
  if (itemid === 223834) {
    return { low: 0.21, high: 0.6, cohort: "FiO₂ fraction (0.21 = room air)" };
  }

  // O₂ flow (L/min): shade low-flow band; “normal” at rest is 0
  if (itemid === 227287 || itemid === 223848) {
    return { low: 0, high: 6, cohort: "O₂ flow L/min (0–6 shaded)" };
  }

  return null;
}

export type VitalStatus = "normal" | "abnormal" | "unknown";

export function classifyVitalValue(
  itemid: number,
  valuenum: number,
  demographics: VitalDemographics,
): VitalStatus {
  if (itemid === 223834) {
    const f = normalizeFiO2Fraction(valuenum);
    return f <= 0.22 ? "normal" : "abnormal";
  }
  if (itemid === 227287 || itemid === 223848) {
    return valuenum <= 0.05 ? "normal" : "abnormal";
  }

  const band = getVitalReferenceBand(itemid, demographics);
  if (!band) return "unknown";

  let v = valuenum;
  if (itemid === 223761) {
    v = normalizeTemperatureToCelsius(valuenum);
  }

  if (v >= band.low && v <= band.high) return "normal";
  return "abnormal";
}

/** Y-axis domain that keeps both data and reference band visible */
export function computeYDomain(
  values: number[],
  band: VitalReferenceBand | null,
): [number, number] {
  const finite = values.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (finite.length === 0) {
    if (band) return [band.low * 0.95, band.high * 1.05];
    return [0, 1];
  }
  let vmin = Math.min(...finite);
  let vmax = Math.max(...finite);
  if (band) {
    vmin = Math.min(vmin, band.low);
    vmax = Math.max(vmax, band.high);
  }
  const span = vmax - vmin || Math.abs(vmax || 1) * 0.1;
  const pad = span * 0.08;
  return [vmin - pad, vmax + pad];
}
