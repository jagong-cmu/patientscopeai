import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  CurrentVitalsResponse,
  DischargeDestinationCode,
  DischargeEventResponse,
  DischargeTimingResponse,
  NarrativeResponse,
  NewsScoreResponse,
  PatientSummary,
  RiskResponse,
  VitalsSeriesResponse,
  WatchlistRow,
} from "../api/types";
import { apiGet, apiPost } from "../api/client";
import { NarrativeBlock } from "../components/NarrativeBlock";
import { NewsScorePanel } from "../components/NewsScorePanel";
import { DischargeTimingPanel } from "../components/DischargeTimingPanel";
import { RiskAndContextPanel } from "../components/RiskAndContextPanel";
import { VitalsCombinedPanel } from "../components/VitalsCombinedPanel";
import { HubLayout } from "../components/hub/HubLayout";
import { NarrativeLoading } from "../components/NarrativeLoading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useLayoutEffect, useRef, useState } from "react";

const DISCHARGE_DESTINATIONS = [
  { value: "general_ward", label: "General Ward" },
  { value: "ltach", label: "Long-Term Acute Care Hospital (LTACH)" },
  { value: "nursing_facility", label: "Nursing Facility" },
  { value: "home", label: "Home" },
  { value: "other", label: "Other" },
] as const;

const backLinkClass =
  "font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline";

export default function PatientDetailPage() {
  const queryClient = useQueryClient();
  const { stayId } = useParams();
  const id = Number(stayId);
  const invalid = !stayId || Number.isNaN(id);

  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [dischargeDest, setDischargeDest] = useState<string>("general_ward");
  const [dischargeNotes, setDischargeNotes] = useState("");
  const [postMonitorAfterDischarge, setPostMonitorAfterDischarge] = useState(false);
  const [narrativeVisible, setNarrativeVisible] = useState<NarrativeResponse | null>(null);
  const [narrativeRevealPending, setNarrativeRevealPending] = useState(false);

  const results = useQueries({
    queries: [
      {
        queryKey: ["patient", id],
        enabled: !invalid,
        queryFn: () => apiGet<PatientSummary>(`/api/patient/${id}`),
      },
      {
        queryKey: ["news", id],
        enabled: !invalid,
        queryFn: () => apiGet<NewsScoreResponse>(`/api/news/${id}`),
      },
      {
        queryKey: ["risk", id],
        enabled: !invalid,
        queryFn: () => apiGet<RiskResponse>(`/api/risk/${id}`),
      },
      {
        queryKey: ["vitals", id],
        enabled: !invalid,
        queryFn: () => apiGet<CurrentVitalsResponse>(`/api/vitals/${id}`),
      },
      {
        queryKey: ["vitals-series", id],
        enabled: !invalid,
        queryFn: () => apiGet<VitalsSeriesResponse>(`/api/vitals/${id}/series`),
      },
      {
        queryKey: ["discharge-timing", id],
        enabled: !invalid,
        queryFn: () => apiGet<DischargeTimingResponse>(`/api/risk/${id}/discharge-timing`),
      },
    ],
  });

  const [patientQ, newsQ, riskQ, vitalsQ, vitalsSeriesQ, dischargeTimingQ] = results;

  const narrativeMut = useMutation({
    mutationFn: () => apiGet<NarrativeResponse>(`/api/narrative/${id}`, { timeoutMs: 180_000 }),
    onMutate: () => {
      setNarrativeVisible(null);
    },
    onSuccess: (data) => {
      const delay = 2000 + Math.random() * 2000;
      setNarrativeRevealPending(true);
      window.setTimeout(() => {
        setNarrativeVisible(data);
        setNarrativeRevealPending(false);
      }, delay);
    },
    onError: () => {
      setNarrativeRevealPending(false);
    },
  });

  const dischargeMut = useMutation({
    mutationFn: async () => {
      const subjectId = patientQ.data?.subject_id;
      if (!subjectId) {
        throw new Error("Patient data not loaded");
      }
      await apiPost<DischargeEventResponse>("/api/discharge-events", {
        stay_id: id,
        subject_id: subjectId,
        destination: dischargeDest as DischargeDestinationCode,
        notes: dischargeDest === "other" ? dischargeNotes.trim() || undefined : undefined,
      });
      const didPm = postMonitorAfterDischarge;
      if (didPm) {
        await apiPost<WatchlistRow>("/api/watchlist", {
          subject_id: subjectId,
          index_stay_id: id,
        });
      }
      return { didPostMonitor: didPm };
    },
    onSuccess: (result) => {
      toast.success(
        result.didPostMonitor
          ? "Discharge recorded — patient added to post-monitoring"
          : "Discharge destination recorded",
      );
      setDischargeOpen(false);
      setDischargeNotes("");
      setPostMonitorAfterDischarge(false);
      void queryClient.invalidateQueries({ queryKey: ["stays"] });
      void queryClient.invalidateQueries({ queryKey: ["ward-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      void queryClient.invalidateQueries({ queryKey: ["ward-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["patient", id] });
    },
    onError: (e: Error) => {
      toast.error(e.message.slice(0, 400));
    },
  });

  if (invalid) {
    return (
      <HubLayout title="Invalid stay">
        <p className="text-sm text-critical">
          Bad stay id.{" "}
          <Link className={backLinkClass} to="/patients">
            Back to patients
          </Link>
        </p>
      </HubLayout>
    );
  }

  const loadingCore = results.slice(0, 5).some((q) => q.isLoading);
  const errCore = results.slice(0, 2).find((q) => q.error)?.error as Error | undefined;

  const patient = patientQ.data;
  const displayPatient = patient ? `Patient ${String(patient.subject_id % 10000).padStart(5, "0")}` : "—";

  const timingLoading = dischargeTimingQ.isLoading;
  const timingErr = dischargeTimingQ.error;
  const timingData = dischargeTimingQ.data;
  const hasTimingContent =
    timingLoading ||
    !!timingErr ||
    (timingData?.scenarios?.length ?? 0) > 0;

  const narrativeBusy = narrativeMut.isPending || narrativeRevealPending;

  const riskAsideRef = useRef<HTMLElement>(null);
  const [riskAsidePx, setRiskAsidePx] = useState<number | undefined>(undefined);
  const [lgUp, setLgUp] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setLgUp(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const el = riskAsideRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setRiskAsidePx(Math.round(el.getBoundingClientRect().height));
    });
    ro.observe(el);
    setRiskAsidePx(Math.round(el.getBoundingClientRect().height));
    return () => ro.disconnect();
  }, [
    patient?.subject_id,
    hasTimingContent,
    timingLoading,
    timingData,
    riskQ.data,
    narrativeVisible,
    narrativeMut.isPending,
  ]);

  const summaryColumnSyncStyle =
    lgUp && riskAsidePx != null ? ({ height: riskAsidePx, maxHeight: riskAsidePx } as const) : undefined;

  return (
    <HubLayout
      title={`${displayPatient} · Stay ${id}`}
      topbarBack={{ label: "Patients", href: "/patients" }}
      topbarCenter={`${displayPatient} — Stay ${id}`}
    >
      <Dialog
        open={dischargeOpen}
        onOpenChange={(open) => {
          setDischargeOpen(open);
          if (!open) setPostMonitorAfterDischarge(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record discharge destination</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <RadioGroup value={dischargeDest} onValueChange={setDischargeDest} className="gap-3">
              {DISCHARGE_DESTINATIONS.map((d) => (
                <div key={d.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={d.value} id={`dest-${d.value}`} />
                  <Label htmlFor={`dest-${d.value}`} className="cursor-pointer font-normal">
                    {d.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <div className="flex items-start gap-3 rounded-md border border-border p-3">
              <Checkbox
                id="post-monitor"
                checked={postMonitorAfterDischarge}
                onCheckedChange={(c) => setPostMonitorAfterDischarge(c === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="post-monitor" className="cursor-pointer font-medium leading-none">
                  Post-monitor this patient
                </Label>
                <p className="text-xs text-muted-foreground">Include on the post-monitoring list for follow-up.</p>
              </div>
            </div>
            {dischargeDest === "other" && (
              <div className="space-y-2">
                <Label htmlFor="discharge-notes">Notes (optional)</Label>
                <Textarea
                  id="discharge-notes"
                  placeholder="Specify destination or context"
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDischargeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={dischargeMut.isPending || !patient?.subject_id}
              onClick={() => dischargeMut.mutate()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loadingCore && (
        <div className="space-y-8" aria-busy="true" aria-label="Loading patient record">
          <p className="text-sm text-muted-foreground">Loading patient record…</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      )}
      {errCore && (
        <p className="text-sm text-critical">
          {errCore.message}{" "}
          <Link className={backLinkClass} to="/patients">
            Back
          </Link>
        </p>
      )}

      {!loadingCore && !errCore && patient && newsQ.data && (
        <div className="space-y-6 animate-in fade-in-0 duration-300">
          {/*
            Single 2×2 grid: summary↔risk & timing, narrative↔NEWS (paired row heights).
          */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <div
              className="flex min-h-0 flex-col gap-3 lg:min-w-0"
              style={summaryColumnSyncStyle}
            >
              <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Patient Summary
              </h2>
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-[var(--shadow-card)]">
                <CardHeader className="shrink-0 border-b border-border bg-muted/20 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl">{displayPatient}</CardTitle>
                      <CardDescription className="mt-1 text-sm">ICU stay {id}</CardDescription>
                    </div>
                    {!patient.discharged_from_icu ? (
                      <Button
                        type="button"
                        size="sm"
                        className="transition-transform active:scale-[0.98]"
                        onClick={() => {
                          setPostMonitorAfterDischarge(false);
                          setDischargeOpen(true);
                        }}
                      >
                        Discharge patient
                      </Button>
                    ) : (
                      <p className="max-w-sm text-right text-xs text-muted-foreground">
                        Discharge recorded — removed from ICU census
                        {patient.post_monitoring ? " · post-monitoring" : ""}
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain pt-6">
                  <div className="grid gap-5 md:grid-cols-2 md:gap-8">
                    <div className="space-y-3 text-sm leading-snug">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demographics</p>
                      <dl className="grid gap-3">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Age</dt>
                          <dd className="font-tabular font-medium text-foreground">{patient.age_years?.toFixed(0) ?? "—"}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Sex</dt>
                          <dd className="text-foreground">{patient.gender ?? "—"}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Race / ethnicity</dt>
                          <dd className="text-right text-foreground">{patient.race ?? "—"}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Insurance</dt>
                          <dd className="text-right text-foreground">{patient.insurance ?? "—"}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="space-y-3 text-sm leading-snug">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stay</p>
                      <dl className="grid gap-3">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">ICU LOS</dt>
                          <dd className="font-tabular font-medium text-foreground">
                            {patient.icu_los_hours != null ? `${patient.icu_los_hours.toFixed(1)} h` : "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Hospital LOS</dt>
                          <dd className="font-tabular font-medium text-foreground">
                            {patient.hospital_los_hours != null ? `${patient.hospital_los_hours.toFixed(1)} h` : "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Unit</dt>
                          <dd className="text-right text-foreground">{patient.first_careunit ?? "—"}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Disposition</dt>
                          <dd className="text-right text-foreground">{patient.discharge_location ?? "—"}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-lg border border-border bg-secondary/20 p-4 md:p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary diagnosis</p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">
                      {patient.primary_diagnosis ?? "Not available"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside ref={riskAsideRef} className="flex min-h-0 flex-col gap-3 lg:min-w-0">
              <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Risk &amp; timing
              </h2>
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <RiskAndContextPanel
                  risk={riskQ.data}
                  narrative={narrativeVisible ?? undefined}
                  narrativeLoading={narrativeMut.isPending}
                />
                {hasTimingContent && (
                  <Card className="shadow-[var(--shadow-card)]">
                    <CardContent className="space-y-2 pt-4">
                      {timingLoading && <p className="text-[11px] text-muted-foreground">Loading…</p>}
                      {timingErr && (
                        <p className="text-[11px] text-critical">Discharge timing unavailable.</p>
                      )}
                      {(timingData?.scenarios?.length ?? 0) > 0 ? (
                        <DischargeTimingPanel data={timingData} />
                      ) : null}
                    </CardContent>
                  </Card>
                )}
              </div>
            </aside>

            <section className="lg:min-w-0">
              <Card className="shadow-[var(--shadow-card)]">
                <CardContent className="flex flex-col items-center gap-4 px-6 py-6">
                  <h2 className="text-sm font-semibold text-foreground">Clinical narrative</h2>
                  <Button
                    type="button"
                    size="lg"
                    variant={narrativeVisible ? "outline" : "default"}
                    disabled={narrativeBusy}
                    className="w-full max-w-md transition-transform active:scale-[0.98] disabled:active:scale-100"
                    onClick={() => narrativeMut.mutate()}
                  >
                    {narrativeBusy ? "Generating…" : narrativeVisible ? "Regenerate" : "Generate narrative"}
                  </Button>
                </CardContent>
              </Card>
              {narrativeMut.isError && (
                <p className="mt-3 text-sm text-critical">{(narrativeMut.error as Error).message}</p>
              )}
              {(narrativeMut.isPending || narrativeRevealPending) && (
                <div className="mt-4">
                  <NarrativeLoading />
                </div>
              )}
              {narrativeVisible && !narrativeBusy && (
                <div className="mt-4">
                  <NarrativeBlock data={narrativeVisible} />
                </div>
              )}
            </section>

            <div className="space-y-2 lg:min-w-0">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">NEWS</h2>
              <NewsScorePanel data={newsQ.data} compact />
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vitals</h2>
            {vitalsQ.data || vitalsSeriesQ.data ? (
              <VitalsCombinedPanel
                current={vitalsQ.data}
                series={vitalsSeriesQ.data}
                demographics={{
                  ageYears: patient.age_years,
                  gender: patient.gender,
                }}
              />
            ) : null}
            {vitalsQ.isLoading && !(vitalsQ.data || vitalsSeriesQ.data) && (
              <>
                <p className="text-sm text-muted-foreground">Loading vitals…</p>
                <Skeleton className="h-44 w-full rounded-xl" />
              </>
            )}
            {(vitalsQ.error || vitalsSeriesQ.error) && (
              <p className="text-sm text-critical">Vitals unavailable for this stay.</p>
            )}
          </section>
        </div>
      )}
    </HubLayout>
  );
}
