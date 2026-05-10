import type { CurrentVitalsResponse } from "../api/types";
import type { VitalDemographics } from "../lib/vitalReferenceRanges";
import {
  classifyVitalValue,
  normalizeFiO2Fraction,
  normalizeTemperatureToCelsius,
} from "../lib/vitalReferenceRanges";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatChartTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayValue(itemid: number, value: number): string {
  if (itemid === 223834) {
    const f = normalizeFiO2Fraction(value);
    return `${(f * 100).toFixed(0)}%`;
  }
  if (itemid === 223761 && value > 45) {
    const c = normalizeTemperatureToCelsius(value);
    return `${c.toFixed(1)} °C (${value.toFixed(1)} °F)`;
  }
  return String(value);
}

function statusBadge(status: ReturnType<typeof classifyVitalValue>) {
  if (status === "normal") {
    return (
      <Badge variant="outline" className="shrink-0 border-emerald-600/50 text-[10px] text-emerald-800 dark:text-emerald-400">
        Normal
      </Badge>
    );
  }
  if (status === "abnormal") {
    return (
      <Badge variant="outline" className="shrink-0 border-destructive/60 text-[10px] text-critical">
        Abnormal
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
      —
    </Badge>
  );
}

export function VitalsPanel({
  data,
  demographics,
}: {
  data: CurrentVitalsResponse;
  demographics: VitalDemographics;
}) {
  const rows = data.vitals;

  if (rows.length === 0) {
    return (
      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No charted vitals in the last 24 hours of this ICU stay for the tracked measures.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          {rows.map((v) => {
            const status = classifyVitalValue(v.itemid, v.value, demographics);
            return (
              <div
                key={v.itemid}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border border-border bg-card/50 px-3 py-2.5",
                  "text-sm",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium leading-tight text-foreground">{v.label}</p>
                  {statusBadge(status)}
                </div>
                <p className="font-tabular text-base font-semibold tracking-tight text-foreground">
                  {displayValue(v.itemid, v.value)}
                </p>
                <p className="text-[11px] leading-none text-muted-foreground">{formatChartTime(v.charttime_iso)}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
