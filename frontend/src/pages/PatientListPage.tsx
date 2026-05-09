import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bed, Clock, HeartPulse, LogOut } from "lucide-react";
import type { ReadinessStatus, StayListResponse } from "../api/types";
import { apiGet } from "../api/client";
import { HubLayout } from "../components/hub/HubLayout";
import { StatCard } from "../components/hub/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function readinessSquareClass(status: ReadinessStatus) {
  switch (status) {
    case "green":
      return "bg-success";
    case "yellow":
      return "bg-warning";
    case "red":
      return "bg-critical";
    default:
      return "bg-muted";
  }
}

export default function PatientListPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stays"],
    queryFn: () => apiGet<StayListResponse>("/api/stays"),
  });

  const stats = useMemo(() => {
    const rows = data?.stays ?? [];
    const n = rows.length;
    const losVals = rows.map((r) => r.icu_los_hours).filter((x): x is number => x != null);
    const avgLos = losVals.length ? losVals.reduce((a, b) => a + b, 0) / losVals.length : 0;
    const green = rows.filter((r) => r.readiness_status === "green").length;
    const concern = rows.filter((r) => r.readiness_status === "yellow" || r.readiness_status === "red").length;
    return { n, avgLos, green, concern };
  }, [data]);

  const subtitle = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  return (
    <HubLayout title="ICU overview" subtitle={`${subtitle} · roster from MIMIC demo (los ≥ 1)`}>
      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading census…</p>
      )}
      {error && (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="text-critical">
            Failed to load roster — ensure <code className="font-tabular">GET /api/stays</code> returns JSON on your API host.
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <p className="text-xs text-muted-foreground">
            Production: set <code className="rounded bg-muted px-1">VITE_API_BASE</code> to your API origin (no trailing slash) in Vercel and redeploy.
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Census rows"
              value={String(stats.n)}
              icon={Bed}
              tone="primary"
              hint="Loaded stays (demo cap)"
              delta={{ value: `${stats.n}`, direction: "up", positive: true }}
            />
            <StatCard
              label="Avg ICU LOS"
              value={`${stats.avgLos.toFixed(1)}h`}
              icon={Clock}
              tone="warning"
              hint="Mean across roster"
            />
            <StatCard
              label="Ready-leaning"
              value={String(stats.green)}
              icon={LogOut}
              tone="success"
              hint="Composite green (demo row live)"
            />
            <StatCard
              label="Elevated concern"
              value={String(stats.concern)}
              icon={HeartPulse}
              tone="critical"
              hint="Yellow + red flags"
              delta={{ value: `${stats.concern}`, direction: "up", positive: false }}
            />
          </div>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle>Readiness map</CardTitle>
              <CardDescription>
                One square per census row — color encodes composite readiness (same scale as roster badges).
              </CardDescription>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-success" aria-hidden />
                  Ready-leaning
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-warning" aria-hidden />
                  Concerning
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-critical" aria-hidden />
                  High concern
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1.5 sm:gap-2">
                {data.stays.map((row) => (
                  <Link
                    key={row.stay_id}
                    to={`/stay/${row.stay_id}`}
                    title={`${row.display_patient_id} · stay ${row.stay_id} · ${row.readiness_status}`}
                    className={cn(
                      "size-8 shrink-0 rounded-md shadow-sm ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      readinessSquareClass(row.readiness_status),
                      row.is_demo && "ring-2 ring-primary ring-offset-2",
                    )}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)] lg:col-span-full">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Patient roster</CardTitle>
                <CardDescription>Anonymized IDs · click a row for full assessment</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Patient</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead>Sex</TableHead>
                    <TableHead className="max-w-[240px]">Primary diagnosis</TableHead>
                    <TableHead className="text-right font-tabular">ICU LOS (h)</TableHead>
                    <TableHead>Readiness</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.stays.map((row) => (
                    <TableRow key={row.stay_id} className={row.is_demo ? "bg-primary/5" : undefined}>
                      <TableCell className="font-medium">
                        <Link
                          className="text-primary hover:underline"
                          to={`/stay/${row.stay_id}`}
                        >
                          {row.display_patient_id}
                          {row.is_demo ? (
                            <Badge variant="secondary" className="ml-2 bg-primary/15 text-primary">
                              Demo
                            </Badge>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-tabular">
                        {row.age_years != null ? row.age_years.toFixed(0) : "—"}
                      </TableCell>
                      <TableCell>{row.gender ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground" title={row.primary_diagnosis ?? ""}>
                        {row.primary_diagnosis ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-tabular">
                        {row.icu_los_hours != null ? row.icu_los_hours.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.readiness_status} compact />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </HubLayout>
  );
}
