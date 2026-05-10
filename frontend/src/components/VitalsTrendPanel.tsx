import type { VitalsSeriesResponse } from "../api/types";
import type { VitalDemographics } from "../lib/vitalReferenceRanges";
import {
  classifyVitalValue,
  computeYDomain,
  getVitalReferenceBand,
  normalizeFiO2Fraction,
  normalizeTemperatureToCelsius,
} from "../lib/vitalReferenceRanges";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";

function tickLabel(iso: string | null, index: number) {
  if (!iso) return String(index + 1);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(index + 1);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function chartValueForItem(itemid: number, valuenum: number): number {
  if (itemid === 223761) return normalizeTemperatureToCelsius(valuenum);
  if (itemid === 223834) return normalizeFiO2Fraction(valuenum);
  return valuenum;
}

function formatTooltipValue(itemid: number, chartVal: number, rawVal: number): string {
  if (itemid === 223761) {
    const rawIsF = rawVal > 45;
    return `${chartVal.toFixed(1)} °C${rawIsF ? ` (${rawVal.toFixed(1)} °F chart)` : ""}`;
  }
  if (itemid === 223834) {
    const frac = normalizeFiO2Fraction(rawVal);
    return `${(frac * 100).toFixed(0)}% FiO₂`;
  }
  return chartVal.toFixed(2);
}

export function VitalsTrendPanel({
  data,
  demographics,
}: {
  data: VitalsSeriesResponse;
  demographics: VitalDemographics;
}) {
  if (data.series.length === 0) {
    return <p className="text-sm text-muted-foreground">No charted vitals in this window.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-4 lg:gap-5">
      {data.series.map((s) => {
        const band = getVitalReferenceBand(s.itemid, demographics);
        const chartData = s.points.map((p, i) => ({
          idx: i,
          v: chartValueForItem(s.itemid, p.valuenum),
          raw: p.valuenum,
          tlabel: tickLabel(p.charttime_iso, i),
          iso: p.charttime_iso,
        }));
        const chartVals = chartData.map((d) => d.v);
        const [yMin, yMax] = computeYDomain(chartVals, band);
        const lastRaw = s.points[s.points.length - 1]?.valuenum;
        const status =
          lastRaw != null ? classifyVitalValue(s.itemid, lastRaw, demographics) : ("unknown" as const);

        const yAxisLabel =
          s.itemid === 223761 ? "°C" : s.itemid === 223834 ? "FiO₂" : s.itemid === 227287 || s.itemid === 223848 ? "L/min" : "";

        return (
          <div key={s.itemid} className="min-w-0 rounded-lg border border-border/80 bg-card/30 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{s.label}</p>
              {band && (
                <span className="text-[11px] text-muted-foreground">
                  Ref{" "}
                  {s.itemid === 223834
                    ? `${(band.low * 100).toFixed(0)}–${(band.high * 100).toFixed(0)}%`
                    : `${band.low}–${band.high}`}
                  {yAxisLabel === "°C" ? " °C" : null}
                </span>
              )}
              {status === "normal" && (
                <Badge variant="outline" className="border-emerald-600/50 text-emerald-800 dark:text-emerald-400">
                  Normal
                </Badge>
              )}
              {status === "abnormal" && (
                <Badge variant="outline" className="border-destructive/60 text-critical">
                  Abnormal
                </Badge>
              )}
              {status === "unknown" && (
                <Badge variant="secondary" className="text-xs font-normal">
                  Reference N/A
                </Badge>
              )}
            </div>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`vitals-ref-fill-${s.itemid}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0} />
                      <stop offset="12%" stopColor="var(--primary)" stopOpacity={0.06} />
                      <stop offset="88%" stopColor="var(--primary)" stopOpacity={0.06} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.35} />
                  {band && (
                    <ReferenceArea
                      y1={band.low}
                      y2={band.high}
                      fill={`url(#vitals-ref-fill-${s.itemid})`}
                      stroke="var(--primary)"
                      strokeOpacity={0.14}
                      strokeWidth={1}
                      isAnimationActive={false}
                    />
                  )}
                  <XAxis dataKey="tlabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis
                    width={44}
                    tick={{ fontSize: 10 }}
                    domain={[yMin, yMax]}
                    label={
                      yAxisLabel
                        ? { value: yAxisLabel, angle: -90, position: "insideLeft", style: { fontSize: 10 } }
                        : undefined
                    }
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: number, _name: string, props: { payload?: { raw?: number } }) => {
                      const raw = props?.payload?.raw ?? value;
                      return [formatTooltipValue(s.itemid, value, raw), s.label];
                    }}
                    labelFormatter={(_label: string, payload: Array<{ payload?: { iso?: string } }>) => {
                      const iso = payload?.[0]?.payload?.iso;
                      return iso ? new Date(iso).toLocaleString() : "";
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
