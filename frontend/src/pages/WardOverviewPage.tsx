import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type {
  NewsClinicalBand,
  StayListResponse,
  WardAlertsResponse,
  WardSummaryResponse,
} from "../api/types";
import { apiGet } from "../api/client";
import { HubLayout } from "../components/hub/HubLayout";
import { PatientRosterCard } from "../components/hub/PatientRosterCard";
import { NewsBandBadge } from "../components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

function newsSquareClass(band: NewsClinicalBand) {
  switch (band) {
    case "low":
      return "bg-success";
    case "medium":
      return "bg-warning";
    case "high":
      return "bg-critical";
    default:
      return "bg-muted";
  }
}

const patientLinkClass =
  "font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline";

/** Sort tiles: green cluster first, then amber, then red (stable by stay id). */
const BAND_SORT: Record<NewsClinicalBand, number> = { low: 0, medium: 1, high: 2 };

export default function WardOverviewPage() {
  const subtitle = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  const wardQ = useQuery({
    queryKey: ["ward-summary"],
    queryFn: () => apiGet<WardSummaryResponse>("/api/ward/summary"),
    staleTime: 60_000,
    gcTime: 300_000,
  });

  const staysQ = useQuery({
    queryKey: ["stays"],
    queryFn: () => apiGet<StayListResponse>("/api/stays"),
    staleTime: 60_000,
    gcTime: 300_000,
  });

  const alertsQ = useQuery({
    queryKey: ["ward-alerts"],
    queryFn: () => apiGet<WardAlertsResponse>("/api/ward/alerts"),
    retry: false,
    staleTime: 45_000,
    gcTime: 300_000,
  });

  const data = wardQ.data;
  const stays = staysQ.data?.stays ?? [];
  const pendingIcu = staysQ.data?.pending_icu_stays ?? [];

  const bandCounts = useMemo(() => {
    const m: Record<NewsClinicalBand, number> = { low: 0, medium: 0, high: 0 };
    for (const r of stays) {
      m[r.news_band] += 1;
    }
    return m;
  }, [stays]);

  const staysSortedForGrid = useMemo(() => {
    return [...stays].sort((a, b) => {
      const d = BAND_SORT[a.news_band] - BAND_SORT[b.news_band];
      if (d !== 0) return d;
      return a.stay_id - b.stay_id;
    });
  }, [stays]);

  const alertsCardRef = useRef<HTMLDivElement>(null);
  const [alertsHeightPx, setAlertsHeightPx] = useState<number | undefined>(undefined);
  const [lgUp, setLgUp] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setLgUp(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const el = alertsCardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setAlertsHeightPx(Math.round(el.getBoundingClientRect().height));
    });
    ro.observe(el);
    setAlertsHeightPx(Math.round(el.getBoundingClientRect().height));
    return () => ro.disconnect();
  }, [data, alertsQ.data, alertsQ.isLoading, alertsQ.isError]);

  const bedCardSyncStyle =
    lgUp && alertsHeightPx != null
      ? ({ height: alertsHeightPx, maxHeight: alertsHeightPx } as const)
      : undefined;

  return (
    <HubLayout title="Ward Overview" subtitle={subtitle}>
      {wardQ.isLoading && (
        <div className="space-y-6 animate-in fade-in-0 duration-300" aria-busy="true" aria-label="Loading ward overview">
          <p className="text-sm text-muted-foreground">Loading Ward Summary…</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="h-52 w-full rounded-xl" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-10 w-48 rounded-md" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      )}
      {wardQ.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-critical">
          {wardQ.error instanceof Error ? wardQ.error.message : String(wardQ.error)}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-6 animate-in fade-in-0 duration-300 lg:grid-cols-2 lg:items-start">
            <Card
              className="flex min-h-0 flex-col overflow-hidden shadow-[var(--shadow-card)]"
              style={bedCardSyncStyle}
            >
              <CardHeader className="shrink-0 pb-2">
                <CardTitle className="text-lg">Bed Utilization</CardTitle>
                <CardDescription>
                  {data.census_count} patients · {data.pending_admissions_count} pending admission
                  {data.pending_admissions_count === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="flex shrink-0 flex-wrap items-end gap-6">
                  <div>
                    <p className="text-4xl font-semibold tabular-nums tracking-tight">
                      {data.census_count}
                      <span className="text-muted-foreground"> / </span>
                      {data.bed_capacity}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Beds In Use</p>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium tabular-nums">{Math.max(0, data.bed_capacity - data.census_count)}</p>
                    <p className="text-muted-foreground">Available Beds</p>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-border pt-4">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">NEWS Distribution</h3>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Low {bandCounts.low} · Medium {bandCounts.medium} · High {bandCounts.high}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-success" aria-hidden />
                      Low
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-warning" aria-hidden />
                      Medium
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-critical" aria-hidden />
                      High
                    </span>
                  </div>

                  {staysQ.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading roster for grid…</p>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                      <div
                        className={cn(
                          "grid w-full gap-1",
                          "grid-cols-[repeat(auto-fill,minmax(1.625rem,1fr))]",
                          "sm:grid-cols-[repeat(auto-fill,minmax(1.75rem,1fr))]",
                        )}
                      >
                        {staysSortedForGrid.map((row) => (
                          <Link
                            key={row.stay_id}
                            to={`/patients/${row.stay_id}`}
                            title={`${row.display_patient_id} · NEWS ${row.news_total}`}
                            className={cn(
                              "block aspect-square w-full min-h-[1.625rem] rounded-sm shadow-sm ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[1.75rem]",
                              newsSquareClass(row.news_band),
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card ref={alertsCardRef} className="shadow-[var(--shadow-card)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Critical Alerts</CardTitle>
                <CardDescription>Labs And Monitored Patients</CardDescription>
              </CardHeader>
              <CardContent>
                {alertsQ.isLoading && (
                  <div className="space-y-3" aria-busy="true" aria-label="Loading ward alerts">
                    <p className="text-sm text-muted-foreground">Loading alerts…</p>
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                )}
                {!alertsQ.isLoading && alertsQ.data && (
                  <>
                    {alertsQ.data.alerts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No critical alerts right now.</p>
                    ) : (
                      <ul className="max-h-96 space-y-3 overflow-y-auto overscroll-contain pr-1">
                        {alertsQ.data.alerts.map((a) => (
                          <li key={a.id} className="list-none">
                            <Alert
                              variant="destructive"
                              className={cn(
                                "relative overflow-hidden border-critical/50 bg-critical/[0.08] py-3 text-foreground shadow-md shadow-critical/20 [&>svg]:text-critical",
                                "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-critical",
                                "dark:border-critical/60 dark:bg-critical/15 dark:shadow-critical/25",
                              )}
                            >
                              <AlertTriangle className="text-critical" aria-hidden />
                              <AlertDescription className="space-y-2 !text-foreground [&_a]:text-primary">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <p className="text-sm leading-snug">{a.message}</p>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                    {(a.tags ?? []).includes("icu") ? (
                                      <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">
                                        ICU Ward
                                      </Badge>
                                    ) : null}
                                    {(a.tags ?? []).includes("post_monitoring") ? (
                                      <Badge
                                        variant="outline"
                                        className="border-primary/45 text-[10px] font-medium uppercase tracking-wide"
                                      >
                                        Post-Monitoring
                                      </Badge>
                                    ) : null}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(a.occurred_at).toLocaleString()}
                                  {a.stay_id != null ? (
                                    <>
                                      {" · "}
                                      <Link className={patientLinkClass} to={`/patients/${a.stay_id}`}>
                                        Open Stay
                                      </Link>
                                    </>
                                  ) : null}
                                </p>
                              </AlertDescription>
                            </Alert>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {!alertsQ.isLoading && alertsQ.isError && (
                  <p className="text-sm text-muted-foreground">Alerts unavailable.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-lg">Discharge Queue</CardTitle>
                <CardDescription>
                  Lowest 72h Readmission Risk First (Then NEWS) · {data.discharge_ready_count} Patient
                  {data.discharge_ready_count === 1 ? "" : "s"} · {data.pending_admissions_count} Pending Admission
                  {data.pending_admissions_count === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.discharge_queue_preview.length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">No patients in queue.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead className="text-right">72h Risk</TableHead>
                        <TableHead className="text-right">NEWS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.discharge_queue_preview.map((row, i) => (
                        <TableRow key={row.stay_id}>
                          <TableCell className="font-tabular text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            <Link className={patientLinkClass} to={`/patients/${row.stay_id}`}>
                              {row.display_patient_id}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right font-tabular">
                            {row.readmission_risk_72h != null
                              ? `${(row.readmission_risk_72h * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center justify-end gap-2">
                              <span className="font-tabular">{row.news_total}</span>
                              <NewsBandBadge band={row.news_band} compact />
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-lg">Highest Risk Patients</CardTitle>
                <CardDescription>Highest 72h Readmission Risk First, Then NEWS (Top 10)</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.high_risk_preview.length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">No census patients.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead className="text-right">72h Risk</TableHead>
                        <TableHead className="text-right">NEWS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.high_risk_preview.map((row, i) => (
                        <TableRow key={row.stay_id}>
                          <TableCell className="font-tabular text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            <Link className={patientLinkClass} to={`/patients/${row.stay_id}`}>
                              {row.display_patient_id}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right font-tabular">
                            {row.readmission_risk_72h != null
                              ? `${(row.readmission_risk_72h * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center justify-end gap-2">
                              <span className="font-tabular">{row.news_total}</span>
                              <NewsBandBadge band={row.news_band} compact />
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <PatientRosterCard rows={stays} isLoading={staysQ.isLoading} />
          {pendingIcu.length > 0 && (
            <PatientRosterCard
              title="Pending ICU Queue"
              rows={pendingIcu}
              isLoading={staysQ.isLoading}
            />
          )}
        </div>
      )}
    </HubLayout>
  );
}
