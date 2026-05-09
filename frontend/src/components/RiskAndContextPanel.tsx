import type { AuditResponse, NarrativeResponse, RiskDefinition, SimilarCase } from "../api/types";
import { cn } from "@/lib/utils";

function RiskCard({
  title,
  probability,
  ci,
  nTrain,
  methodology,
  calibrationNote,
  disabled,
  anchorId,
}: {
  title: string;
  probability?: number;
  ci?: [number, number];
  nTrain?: number;
  methodology?: string;
  calibrationNote?: string;
  disabled?: boolean;
  anchorId?: string;
}) {
  return (
    <section
      id={anchorId}
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)]",
        disabled && "opacity-90",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {disabled ? (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          Not modeled in v1. Outcome definition reserved for future work — see Methodology.
        </p>
      ) : (
        <>
          <p className="mt-1 font-tabular text-xl font-semibold">
            {probability != null ? `${(probability * 100).toFixed(1)}%` : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            80% interval (illustrative):{" "}
            <span className="font-tabular">
              {ci ? `[${(ci[0] * 100).toFixed(1)}%, ${(ci[1] * 100).toFixed(1)}%]` : "—"}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Training N: <span className="font-tabular">{nTrain ?? "—"}</span>
          </p>
          <p className="mt-2 border-t border-border pt-1 text-[11px] leading-snug text-muted-foreground">
            {methodology}
          </p>
          {calibrationNote && (
            <p className="mt-1 text-[11px] font-medium text-warning">{calibrationNote}</p>
          )}
        </>
      )}
    </section>
  );
}

export function RiskAndContextPanel({
  risk,
  audit,
  narrative,
  narrativeLoading,
}: {
  risk: { risks: RiskDefinition[] } | undefined;
  audit: AuditResponse | undefined;
  narrative: NarrativeResponse | undefined;
  narrativeLoading: boolean;
}) {
  const primary = risk?.risks[0];
  const similar: SimilarCase[] = narrative?.similar_cases ?? [];

  return (
    <div className="flex flex-col gap-3">
      <RiskCard
        title="72h unplanned ICU readmission"
        probability={primary?.probability}
        ci={primary?.confidence_interval}
        nTrain={primary?.n_train}
        methodology={primary?.methodology}
        calibrationNote="Model CI shown as ±10 points around prob (illustrative uncertainty band)."
        anchorId="ev_risk_72h_unplanned_icu"
      />
      <RiskCard title="7-day ICU bounce-back" disabled />
      <RiskCard title="30-day all-cause readmission" disabled />

      <section className="rounded border border-border bg-white p-2 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Concordance (readiness vs risk)
        </p>
        {narrativeLoading && <p className="mt-2 text-[12px] text-muted-foreground">Loading…</p>}
        {!narrativeLoading && narrative?.concordance_signal && (
          <div className="mt-2 space-y-1 text-[12px] leading-snug">
            <p className="font-medium capitalize text-foreground">
              {String(narrative.concordance_signal.pattern).replace(/_/g, " ")}
            </p>
            <p className="text-muted-foreground">{narrative.concordance_signal.rationale}</p>
          </div>
        )}
      </section>

      <section className="rounded border border-border bg-white p-2 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Similar cases
        </p>
        {narrativeLoading && <p className="mt-2 text-[11px] text-muted-foreground">Loading…</p>}
        {!narrativeLoading && similar.length === 0 && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            No indexed neighbors available (Mongo optional / offline).
          </p>
        )}
        <ul className="mt-2 space-y-2">
          {similar.slice(0, 5).map((c) => (
            <li key={c.stay_id} className="border-l-2 border-primary/40 pl-2 text-[11px] leading-snug">
              <span className="font-tabular font-semibold">Stay {c.stay_id}</span> — {(c.similarity * 100).toFixed(0)}
              % match — outcome flag {String(c.readmitted)} ({c.readmission_definition})
            </li>
          ))}
        </ul>
      </section>

      <section
        id="ev_bias_audit"
        className="rounded border border-border bg-white p-2 shadow-sm"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bias / subgroup audit
        </p>
        {!audit && <p className="mt-2 text-[11px] text-muted-foreground">Unavailable.</p>}
        {audit && (
          <div className="mt-2 space-y-1 text-[11px] leading-snug text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{audit.patient_subgroup}</span>
            </p>
            <p className="font-tabular">
              Subgroup AUC {audit.subgroup_performance.auc.toFixed(2)} vs overall{" "}
              {audit.subgroup_performance.auc_overall.toFixed(2)} (n={audit.subgroup_performance.n})
            </p>
            <p>{audit.subgroup_performance.calibration_note}</p>
            <p className="border-t border-border pt-1 text-[12px] text-foreground">
              {audit.trust_advisory}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
