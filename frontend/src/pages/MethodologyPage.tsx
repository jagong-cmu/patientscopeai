import { Link } from "react-router-dom";
import { HubLayout } from "../components/hub/HubLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MethodologyPage() {
  return (
    <HubLayout title="Methodology & limitations" subtitle="Provenance for reviewers and judges">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-lg">Cohort & outcome</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Index unit: each ICU <span className="font-tabular text-foreground">stay_id</span> with LOS ≥ 1 day.
              Primary trained outcome:{" "}
              <strong className="text-foreground">72-hour unplanned ICU readmission</strong> after hospital discharge
              (operational rules in repo <span className="font-tabular">sql/</span>).
            </p>
            <p>
              Additional risk cards marked “not modeled” are scope placeholders — not hidden predictions.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-lg">Readiness & model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Readiness is rule-based (four components); see <span className="font-tabular">docs/scoring_rubric.md</span>.
              Risk uses HistGradientBoosting on Postgres-derived features; trajectory bands are illustrative extrapolations,
              not validated forecasts.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-lg">AI narrative</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            <p>
              Two-stage synthesis → narrative with deterministic validation. Citations reference evidence IDs returned by
              the API alongside the narrative when available.
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link className="text-primary underline" to="/">
            ← ICU overview
          </Link>
        </p>
      </div>
    </HubLayout>
  );
}
