import { useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function WardOverviewPage() {
  const subtitle = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  const wardQ = useQuery({
    queryKey: ["ward-summary"],
    queryFn: () => apiGet<WardSummaryResponse>("/api/ward/summary"),
  });

  const staysQ = useQuery({
    queryKey: ["stays"],
    queryFn: () => apiGet<StayListResponse>("/api/stays"),
  });

  const alertsQ = useQuery({
    queryKey: ["ward-alerts"],
    queryFn: () => apiGet<WardAlertsResponse>("/api/ward/alerts"),
    retry: false,
  });

  const data = wardQ.data;
  const stays = staysQ.data?.stays ?? [];

  const bandCounts = useMemo(() => {
    const m: Record<NewsClinicalBand, number> = { low: 0, medium: 0, high: 0 };
    for (const r of stays) {
      m[r.news_band] += 1;
    }
    return m;
  }, [stays]);

  return (
    <HubLayout title="Ward overview" subtitle={subtitle}>
      {wardQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {wardQ.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-critical">
          {wardQ.error instanceof Error ? wardQ.error.message : String(wardQ.error)}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/patients">Patient roster</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/post-monitoring">Post-monitoring</Link>
            </Button>
          </div>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Bed utilization</CardTitle>
              <CardDescription>
                {data.census_count} patients · {data.pending_admissions_count} pending admission
                {data.pending_admissions_count === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <p className="text-4xl font-semibold tabular-nums tracking-tight">
                    {data.census_count}
                    <span className="text-muted-foreground"> / </span>
                    {data.bed_capacity}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Beds in use</p>
                </div>
                <div className="text-sm">
                  <p className="font-medium tabular-nums">{Math.max(0, data.bed_capacity - data.census_count)}</p>
                  <p className="text-muted-foreground">Available beds</p>
                </div>
              </div>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline">
                  <ChevronDown className="size-4 transition-transform [[data-state=open]_&]:rotate-180" />
                  NEWS distribution & grid
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Low {bandCounts.low} · Medium {bandCounts.medium} · High {bandCounts.high}
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
                    <p className="text-sm text-muted-foreground">Loading roster…</p>
                  ) : (
                    <div className="grid max-h-48 grid-cols-[repeat(auto-fill,minmax(1.25rem,1fr))] gap-1 overflow-y-auto sm:max-h-none">
                      {stays.map((row) => (
                        <Link
                          key={row.stay_id}
                          to={`/patients/${row.stay_id}`}
                          title={`${row.display_patient_id} · NEWS ${row.news_total}`}
                          className={cn(
                            "size-5 shrink-0 rounded-sm shadow-sm ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            newsSquareClass(row.news_band),
                          )}
                        />
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {alertsQ.data && (
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Critical alerts</CardTitle>
                <CardDescription>Labs and monitored patients</CardDescription>
              </CardHeader>
              <CardContent>
                {alertsQ.data.alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No critical alerts right now.</p>
                ) : (
                  <ul className="max-h-64 space-y-3 overflow-y-auto text-sm">
                    {alertsQ.data.alerts.map((a) => (
                      <li key={a.id} className="border-b border-border pb-3 last:border-0">
                        <p className="text-foreground">{a.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(a.occurred_at).toLocaleString()}
                          {a.stay_id != null ? (
                            <>
                              {" · "}
                              <Link className={patientLinkClass} to={`/patients/${a.stay_id}`}>
                                Open stay
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {alertsQ.isError && <p className="text-sm text-muted-foreground">Alerts unavailable.</p>}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-lg">Discharge queue</CardTitle>
                <CardDescription>
                  {data.discharge_ready_count} patient{data.discharge_ready_count === 1 ? "" : "s"} ready for discharge
                  review · {data.pending_admissions_count} pending admission
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
                        <TableHead className="text-right">NEWS</TableHead>
                        <TableHead>Band</TableHead>
                        <TableHead className="text-right">ICU LOS (h)</TableHead>
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
                          <TableCell className="text-right font-tabular">{row.news_total}</TableCell>
                          <TableCell>
                            <NewsBandBadge band={row.news_band} compact />
                          </TableCell>
                          <TableCell className="text-right font-tabular">
                            {row.icu_los_hours != null ? row.icu_los_hours.toFixed(1) : "—"}
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
                <CardTitle className="text-lg">Highest risk patients</CardTitle>
                <CardDescription>By NEWS aggregate (top 10)</CardDescription>
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
                        <TableHead className="text-right">NEWS</TableHead>
                        <TableHead>Band</TableHead>
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
                          <TableCell className="text-right font-tabular">{row.news_total}</TableCell>
                          <TableCell>
                            <NewsBandBadge band={row.news_band} compact />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </HubLayout>
  );
}
