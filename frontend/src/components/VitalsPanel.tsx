import type { CurrentVitalsResponse } from "../api/types";
import type { VitalDemographics } from "../lib/vitalReferenceRanges";
import {
  classifyVitalValue,
  normalizeFiO2Fraction,
  normalizeTemperatureToCelsius,
} from "../lib/vitalReferenceRanges";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <CardContent className="space-y-3 pt-4">
        <p className="text-xs leading-snug text-muted-foreground">
          Status compares each value to an approximate reference interval for this patient&apos;s age cohort (see Trends
          charts for shaded bands). FiO₂ &gt; room air and any oxygen flow are flagged when therapy is present.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vital</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Chart time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => {
              const status = classifyVitalValue(v.itemid, v.value, demographics);
              return (
                <TableRow key={v.itemid}>
                  <TableCell className="font-medium">{v.label}</TableCell>
                  <TableCell className="text-right font-tabular">{displayValue(v.itemid, v.value)}</TableCell>
                  <TableCell className="text-center">
                    {status === "normal" && (
                      <Badge
                        variant="outline"
                        className="border-emerald-600/50 text-emerald-800 dark:text-emerald-400"
                      >
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
                        —
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{formatChartTime(v.charttime_iso)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
