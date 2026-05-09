import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type {
  AuditResponse,
  NarrativeResponse,
  PatientSummary,
  ReadinessResponse,
  RiskResponse,
  TrajectoryResponse,
} from "../api/types";
import { apiGet } from "../api/client";
import { NarrativeBlock, ActionRecommendations } from "../components/NarrativeBlock";
import { ReadinessPanel } from "../components/ReadinessPanel";
import { RiskAndContextPanel } from "../components/RiskAndContextPanel";
import { TrajectoryPanel } from "../components/TrajectoryPanel";
import { HubLayout } from "../components/hub/HubLayout";
import { NarrativeLoading } from "../components/NarrativeLoading";
import { Card, CardContent } from "@/components/ui/card";

export default function AssessmentPage() {
  const { stayId } = useParams();
  const id = Number(stayId);
  const invalid = !stayId || Number.isNaN(id);

  const results = useQueries({
    queries: [
      {
        queryKey: ["patient", id],
        enabled: !invalid,
        queryFn: () => apiGet<PatientSummary>(`/api/patient/${id}`),
      },
      {
        queryKey: ["readiness", id],
        enabled: !invalid,
        queryFn: () => apiGet<ReadinessResponse>(`/api/readiness/${id}`),
      },
      {
        queryKey: ["risk", id],
        enabled: !invalid,
        queryFn: () => apiGet<RiskResponse>(`/api/risk/${id}`),
      },
      {
        queryKey: ["audit", id],
        enabled: !invalid,
        queryFn: () => apiGet<AuditResponse>(`/api/audit/${id}`),
      },
      {
        queryKey: ["trajectories", id],
        enabled: !invalid,
        queryFn: () => apiGet<TrajectoryResponse>(`/api/trajectories/${id}`),
      },
    ],
  });

  const [patientQ, readinessQ, riskQ, auditQ, trajQ] = results;

  const narrativeQ = useQuery({
    queryKey: ["narrative", id],
    enabled: !invalid,
    queryFn: () => apiGet<NarrativeResponse>(`/api/narrative/${id}`, { timeoutMs: 180_000 }),
    retry: false,
  });

  if (invalid) {
    return (
      <HubLayout title="Invalid stay">
        <p className="text-sm text-critical">
          Bad stay id. <Link className="text-primary underline" to="/">Back to census</Link>
        </p>
      </HubLayout>
    );
  }

  const loadingCore = results.some((q) => q.isLoading);
  // Only patient + readiness are required for the main assessment shell; risk/audit/trajectories
  // may use optional ML/Mongo paths and must not blank the whole page on 404.
  const errCore = results
    .slice(0, 2)
    .find((q) => q.error)?.error as Error | undefined;

  const patient = patientQ.data;
  const displayPatient = patient ? `Patient ${String(patient.subject_id % 10000).padStart(5, "0")}` : "—";

  return (
    <HubLayout
      title={`${displayPatient} · ICU Stay ${id}`}
      subtitle="Discharge readiness, trajectories, risk, and grounded narrative"
      topbarBack={{ label: "Roster", href: "/" }}
      topbarCenter={`${displayPatient} — Stay ${id}`}
    >
      {loadingCore && <p className="text-sm text-muted-foreground">Loading assessment…</p>}
      {errCore && (
        <p className="text-sm text-critical">
          {errCore.message}{" "}
          <Link className="text-primary underline" to="/">Back</Link>
        </p>
      )}

      {!loadingCore && !errCore && patient && readinessQ.data && (
        <>
          <Card className="shadow-[var(--shadow-card)]">
            <CardContent className="space-y-3 pt-6 text-sm">
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <span>
                  <span className="text-muted-foreground">Age </span>
                  <span className="font-tabular font-medium text-foreground">
                    {patient.age_years?.toFixed(0) ?? "—"}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Sex </span>
                  {patient.gender ?? "—"}
                </span>
                <span>
                  <span className="text-muted-foreground">Race/ethnicity </span>
                  {patient.race ?? "—"}
                </span>
                <span>
                  <span className="text-muted-foreground">Insurance </span>
                  {patient.insurance ?? "—"}
                </span>
              </div>
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground">Dx (seq 1): </span>
                {patient.primary_diagnosis ?? "Unavailable"}
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-3 text-muted-foreground">
                <span>
                  ICU LOS{" "}
                  <span className="font-tabular font-medium text-foreground">
                    {patient.icu_los_hours != null ? `${patient.icu_los_hours.toFixed(1)} h` : "—"}
                  </span>
                </span>
                <span>
                  Hospital LOS{" "}
                  <span className="font-tabular font-medium text-foreground">
                    {patient.hospital_los_hours != null ? `${patient.hospital_los_hours.toFixed(1)} h` : "—"}
                  </span>
                </span>
                <span>
                  Unit <span className="font-medium text-foreground">{patient.first_careunit ?? "—"}</span>
                </span>
                <span>
                  Disposition{" "}
                  <span className="font-medium text-foreground">{patient.discharge_location ?? "—"}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <aside className="space-y-2 xl:col-span-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Readiness
              </h2>
              <ReadinessPanel data={readinessQ.data} />
            </aside>
            <section className="space-y-2 xl:col-span-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Trajectories
              </h2>
              {trajQ.data && <TrajectoryPanel data={trajQ.data} />}
              {trajQ.isLoading && <p className="text-sm text-muted-foreground">Loading trajectories…</p>}
              {trajQ.error && (
                <p className="text-sm text-critical">Trajectory series unavailable for this stay.</p>
              )}
            </section>
            <aside className="space-y-2 xl:col-span-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Risk & context
              </h2>
              <RiskAndContextPanel
                risk={riskQ.data}
                audit={auditQ.data}
                narrative={narrativeQ.data}
                narrativeLoading={narrativeQ.isLoading}
              />
            </aside>
          </div>

          <div className="space-y-6">
            {narrativeQ.isLoading && <NarrativeLoading />}
            {narrativeQ.error && (
              <p className="text-sm text-critical">
                Narrative failed: {(narrativeQ.error as Error).message}
              </p>
            )}
            <NarrativeBlock data={narrativeQ.data} />
            <ActionRecommendations narrative={narrativeQ.data} />
          </div>
        </>
      )}
    </HubLayout>
  );
}
