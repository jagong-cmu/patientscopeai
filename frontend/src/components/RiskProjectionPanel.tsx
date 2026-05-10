import type { RiskDefinition, RiskDriverFeature } from "../api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function RiskProjectionPanel({
  risk,
  className,
}: {
  risk: { risks: RiskDefinition[] } | undefined;
  className?: string;
}) {
  const primary = risk?.risks[0];

  if (!primary) {
    return (
      <Card className={cn("shadow-[var(--shadow-card)]", className)}>
        <CardContent className="pt-4 text-sm text-muted-foreground">Risk estimate unavailable.</CardContent>
      </Card>
    );
  }

  const drivers = primary.driver_features ?? [];

  return (
    <Card className={cn("flex min-h-0 flex-1 flex-col shadow-[var(--shadow-card)]", className)} id="ev_risk_72h_unplanned_icu">
      <CardHeader className="shrink-0 border-b border-border bg-muted/15 pb-4">
        <CardTitle className="text-base font-semibold">72h ICU Readmission Score</CardTitle>
        <CardDescription>
          Probabilistic projection from recent vitals and laboratory inputs relative to the training cohort. Values below
          highlight inputs that most influenced this estimate.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-5">
        <div>
          <p className="font-tabular text-4xl font-semibold tracking-tight text-foreground">
            {primary.probability != null ? `${(primary.probability * 100).toFixed(1)}%` : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Estimated probability of unplanned ICU readmission within 72 hours of hospital discharge (training-cohort model).
          </p>
        </div>

        {primary.explanation && (
          <p className="text-[11px] leading-snug text-muted-foreground">{primary.explanation}</p>
        )}

        {drivers.length > 0 ? (
          <div className="min-h-0 flex-1 rounded-lg border border-border bg-secondary/15 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Key Signals</p>
            <ul className="mt-3 space-y-2.5 text-[12px] leading-snug">
              {drivers.slice(0, 8).map((d: RiskDriverFeature, idx: number) => (
                <li key={`${d.feature_key}-${idx}`} className="border-l-2 border-primary/35 pl-3">
                  <span className="font-medium text-foreground">{d.label}</span>
                  <span className="text-muted-foreground"> — {d.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No feature-level breakdown available for this stay.</p>
        )}
      </CardContent>
    </Card>
  );
}
