import type { DischargeTimingResponse } from "../api/types";
import { cn } from "@/lib/utils";

function horizonLabel(h: number): string {
  if (h === 0) return "Now";
  if (h === 12) return "+12 h";
  if (h === 24) return "+24 h";
  return `+${h} h`;
}

export function DischargeTimingPanel({ data }: { data: DischargeTimingResponse | undefined }) {
  if (!data?.scenarios?.length) return null;

  const maxP = Math.max(...data.scenarios.map((s) => s.probability), 1e-6);

  return (
    <div className="space-y-2">
      {data.scenarios.map((s) => (
        <div key={s.horizon_hours}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-foreground">{horizonLabel(s.horizon_hours)}</span>
            <span className="font-tabular text-foreground">
              {(s.probability * 100).toFixed(1)}%
              {s.delta_vs_now != null && s.horizon_hours > 0 && (
                <span
                  className={cn(
                    "ml-2 text-[10px]",
                    s.delta_vs_now > 0 ? "text-critical" : s.delta_vs_now < 0 ? "text-emerald-700" : "text-muted-foreground",
                  )}
                >
                  ({s.delta_vs_now > 0 ? "+" : ""}{(s.delta_vs_now * 100).toFixed(1)} pts vs now)
                </span>
              )}
            </span>
          </div>
          <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                s.horizon_hours === 0 ? "bg-primary" : "bg-primary/70",
              )}
              style={{ width: `${Math.min(100, (s.probability / maxP) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
