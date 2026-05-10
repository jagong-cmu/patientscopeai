import type { VitalsSeriesResponse } from "../api/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function tickLabel(iso: string | null, index: number) {
  if (!iso) return String(index + 1);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(index + 1);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function VitalsTrendPanel({ data }: { data: VitalsSeriesResponse }) {
  if (data.series.length === 0) {
    return <p className="text-sm text-muted-foreground">No charted vitals in this window.</p>;
  }

  return (
    <div className="space-y-8">
      {data.series.map((s) => {
        const chartData = s.points.map((p, i) => ({
          idx: i,
          v: p.valuenum,
          tlabel: tickLabel(p.charttime_iso, i),
          iso: p.charttime_iso,
        }));
        return (
          <div key={s.itemid}>
            <p className="mb-2 text-sm font-medium text-foreground">{s.label}</p>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="tlabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis width={44} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: number) => [value.toFixed(2), s.label]}
                    labelFormatter={(_: string, payload: { payload?: { iso?: string } }[]) => {
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
