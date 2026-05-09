import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrajectorySeries } from "../api/types";

function buildRows(s: TrajectorySeries) {
  type Row = {
    t: number;
    obs: number | null;
    fcMean: number | null;
    fcLo: number | null;
    fcHi: number | null;
  };
  const rows: Row[] = s.points.map((p) => ({
    t: p.t_hours,
    obs: p.y,
    fcMean: null,
    fcLo: null,
    fcHi: null,
  }));
  if (s.forecast) {
    for (let i = 0; i < s.forecast.t_hours.length; i++) {
      rows.push({
        t: s.forecast.t_hours[i],
        obs: null,
        fcMean: s.forecast.mean[i],
        fcLo: s.forecast.lower[i],
        fcHi: s.forecast.upper[i],
      });
    }
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

export function TrajectoryMiniChart({ series }: { series: TrajectorySeries }) {
  const rows = buildRows(series);
  const hasObs = series.points.length > 0;
  const obsVals = rows.filter((r) => r.obs != null).map((r) => r.obs!);
  const fcLoVals = rows.filter((r) => r.fcLo != null).map((r) => r.fcLo!);
  const fcHiVals = rows.filter((r) => r.fcHi != null).map((r) => r.fcHi!);
  const extras = [series.normal_low, series.normal_high].filter(
    (x): x is number => x != null && Number.isFinite(x),
  );
  const candidatesMin = [...obsVals, ...fcLoVals, ...extras];
  const candidatesMax = [...obsVals, ...fcHiVals, ...extras];
  const yMin = candidatesMin.length ? Math.min(...candidatesMin) : 0;
  const yMax = candidatesMax.length ? Math.max(...candidatesMax) : 1;
  const pad = Math.max((yMax - yMin) * 0.08, 1e-6);
  const domainLo = yMin - pad;
  const domainHi = yMax + pad;

  return (
    <div className="flex h-[200px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2 border-b border-border px-2 py-1">
        <div>
          <p className="text-[12px] font-semibold text-foreground">{series.label}</p>
          <p className="font-tabular text-[11px] text-muted-foreground">{series.unit}</p>
        </div>
        <span className="max-w-[140px] text-right text-[10px] leading-tight text-muted-foreground">
          {series.trend_label}
        </span>
      </div>
      <div className="min-h-0 flex-1 px-1 pb-1 pt-0">
        {!hasObs ? (
          <p className="p-3 text-[11px] text-muted-foreground">No observations in ICU window.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis
                type="number"
                dataKey="t"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 10, fill: "#78716c" }}
                label={{ value: "h from ICU admission", position: "insideBottom", offset: -2, fontSize: 9 }}
              />
              <YAxis
                domain={[domainLo, domainHi]}
                width={36}
                tick={{ fontSize: 10, fill: "#78716c" }}
              />
              {series.normal_low != null && series.normal_high != null && (
                <ReferenceArea
                  y1={series.normal_low}
                  y2={series.normal_high}
                  fill="#0f766e"
                  fillOpacity={0.06}
                  strokeOpacity={0}
                />
              )}
              {series.discharge_t_hours != null && (
                <ReferenceLine
                  x={series.discharge_t_hours}
                  stroke="#57534e"
                  strokeDasharray="4 3"
                  label={{ value: "ICU out", position: "top", fontSize: 9, fill: "#57534e" }}
                />
              )}
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="obs"
                stroke="#1e3a5f"
                strokeWidth={1.5}
                dot={{ r: 2 }}
                connectNulls
                isAnimationActive={false}
                name="obs"
              />
              <Line
                type="monotone"
                dataKey="fcMean"
                stroke="#b07d00"
                strokeWidth={1}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
                name="Illustrative forecast"
              />
              <Line
                type="monotone"
                dataKey="fcLo"
                stroke="#a8a29e"
                strokeWidth={0.8}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="fcHi"
                stroke="#a8a29e"
                strokeWidth={0.8}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
