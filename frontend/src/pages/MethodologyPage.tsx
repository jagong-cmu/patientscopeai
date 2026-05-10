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
              The UI surfaces a single trained readmission-risk definition; definitions reserved for future work are not shown as hidden predictions.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-lg">NEWS & risk model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">NEWS</strong> (National Early Warning Score) is computed from the latest structured vitals in a 24h chart window per ICU stay, aligned with UK RCP NEWS2 tables (SpO₂ Scale 1 in this build).
              Exact item IDs and known gaps are documented in <span className="font-tabular">docs/news2_mapping.md</span>.
              Ward occupancy uses census vs configurable <span className="font-tabular">WARD_BED_CAPACITY</span> on <span className="font-tabular">GET /api/ward/summary</span>.
            </p>
            <p>
              <strong className="text-foreground">Post-Monitoring</strong> entries use the same Mongo-backed watchlist API when <span className="font-tabular">MONGODB_URI</span> is set; the UI is a <strong className="text-foreground">global demo</strong> (no per-user auth). NEWS is refreshed from the last available MIMIC chart data — not continuous remote monitoring.
            </p>
            <p>
              <strong className="text-foreground">Discharge destination</strong> logging (<span className="font-tabular">POST /api/discharge-events</span>) also requires MongoDB for persistence.
            </p>
            <p>
              Risk uses a Random Forest (mean imputation, optional SMOTE refit when enabled at train time) on
              Postgres-derived features.
            </p>
            <p>
              <strong className="text-foreground">Snapshot risk</strong> is one probability per stay from chart/lab features
              anchored at ICU exit (training definition). The UI may also show{" "}
              <strong className="text-foreground">discharge timing sensitivity</strong>: the same model evaluated on
              heuristic forward-adjusted features for “now” vs delayed discharge — exploratory counterfactuals, not a
              calibrated minute-by-minute risk trajectory.
            </p>
            <p>
              Brief score explanations list inputs with the highest global feature importance from training and compare this
              patient to cohort distributions — association only, not causal attribution.
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
            ← Ward overview
          </Link>
        </p>
      </div>
    </HubLayout>
  );
}
