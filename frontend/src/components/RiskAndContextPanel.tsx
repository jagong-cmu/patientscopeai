import type { NarrativeResponse, RiskDefinition, RiskDriverFeature, SimilarCase } from "../api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function RiskPrimaryCard({
  primary,
}: {
  primary: RiskDefinition | undefined;
}) {
  if (!primary) {
    return (
      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="pt-4 text-sm text-muted-foreground">Risk estimate unavailable.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-[var(--shadow-card)]" id="ev_risk_72h_unplanned_icu">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">72h unplanned ICU readmission</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-tabular text-2xl font-semibold">
          {primary.probability != null ? `${(primary.probability * 100).toFixed(1)}%` : "—"}
        </p>
        {(primary.explanation || (primary.driver_features?.length ?? 0) > 0) && (
          <div className="border-t border-border pt-2">
            {primary.explanation ? (
              <p className="text-[11px] leading-snug text-foreground">{primary.explanation}</p>
            ) : null}
            {primary.driver_features && primary.driver_features.length > 0 && (
              <ul
                className={`list-inside list-disc space-y-1 text-[11px] text-muted-foreground ${primary.explanation ? "mt-2" : ""}`}
              >
                {primary.driver_features.slice(0, 5).map((d: RiskDriverFeature, idx: number) => (
                  <li key={`${d.label}-${idx}`}>
                    <span className="font-medium text-foreground">{d.label}</span>
                    <span> — {d.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RiskAndContextPanel({
  risk,
  narrative,
  narrativeLoading,
}: {
  risk: { risks: RiskDefinition[] } | undefined;
  narrative: NarrativeResponse | undefined;
  narrativeLoading: boolean;
}) {
  const primary = risk?.risks[0];
  const similar: SimilarCase[] = narrative?.similar_cases ?? [];
  const concordance = narrative?.concordance_signal;

  return (
    <div className="flex flex-col gap-3">
      <RiskPrimaryCard primary={primary} />

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Concordance
            </p>
            {narrativeLoading && <p className="mt-1 text-[12px] text-muted-foreground">Loading…</p>}
            {!narrativeLoading && concordance && (
              <div className="mt-1 space-y-1 text-[12px] leading-snug">
                <p className="font-medium capitalize text-foreground">
                  {String(concordance.pattern).replace(/_/g, " ")}
                </p>
                <p className="text-muted-foreground">{concordance.rationale}</p>
              </div>
            )}
            {!narrativeLoading && !concordance && (
              <p className="mt-1 text-[12px] text-muted-foreground">—</p>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Similar cases
            </p>
            {narrativeLoading && <p className="mt-1 text-[11px] text-muted-foreground">Loading…</p>}
            {!narrativeLoading && similar.length === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">—</p>
            )}
            {!narrativeLoading && similar.length > 0 && (
              <ul className="mt-2 space-y-2">
                {similar.slice(0, 5).map((c) => (
                  <li key={c.stay_id} className="border-l-2 border-primary/40 pl-2 text-[11px] leading-snug">
                    <span className="font-tabular font-semibold">Stay {c.stay_id}</span> —{" "}
                    {(c.similarity * 100).toFixed(0)}% match — outcome {String(c.readmitted)} (
                    {c.readmission_definition})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
