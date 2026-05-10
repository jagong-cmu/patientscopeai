import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { WatchlistListResponse, WatchlistRow } from "../api/types";
import { apiDelete, apiGet } from "../api/client";
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
import { Badge } from "@/components/ui/badge";

export default function PostMonitoringPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => apiGet<WatchlistListResponse>("/api/watchlist"),
    retry: false,
  });

  const removeMut = useMutation({
    mutationFn: (subjectId: number) => apiDelete(`/api/watchlist/${subjectId}`),
    onSuccess: () => {
      toast.success("Removed from post-monitoring list");
      void qc.invalidateQueries({ queryKey: ["watchlist"] });
      void qc.invalidateQueries({ queryKey: ["patient"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: WatchlistRow[] = data?.entries ?? [];
  const mongoUnavailable = error instanceof Error && error.message.includes("503");

  return (
    <HubLayout
      title="Post-Monitoring"
      subtitle="Post–ICU monitoring — NEWS from last MIMIC chart window (demo limits)"
    >
      <Card className="border-dashed shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">How this works</CardTitle>
          <CardDescription>
            Entries are stored when MongoDB is configured on the API. NEWS reflects the most recent structured vitals still
            in the database for that patient — not live telemetry after discharge.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading post-monitoring list">
          <p className="text-sm text-muted-foreground">Loading post-monitoring…</p>
          <div className="grid gap-2">
            <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
          </div>
        </div>
      )}

      {mongoUnavailable && (
        <p className="text-sm text-muted-foreground">
          Post-monitoring API returned unavailable — set <code className="rounded bg-muted px-1">MONGODB_URI</code> on the
          backend to persist rows.
        </p>
      )}

      {error && !mongoUnavailable && (
        <p className="text-sm text-critical">{error instanceof Error ? error.message : String(error)}</p>
      )}

      {data && (
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Monitored patients</CardTitle>
              <CardDescription>{rows.length} entr{rows.length === 1 ? "y" : "ies"} (global demo scope)</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Refresh NEWS
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No patients on post-monitoring. Use the roster or ward overview to manage monitored stays via the API (
                <span className="font-tabular">/api/watchlist</span>).
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Patient</TableHead>
                    <TableHead className="text-right">NEWS</TableHead>
                    <TableHead>Data freshness</TableHead>
                    <TableHead className="text-right">Added</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.subject_id}>
                      <TableCell className="font-medium">
                        <Link className="text-primary hover:underline" to={`/patients/${row.index_stay_id}`}>
                          {row.display_patient_id}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="font-tabular">{row.news_total}</span>
                          <NewsBandBadge band={row.news_band} compact />
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                        <span className="line-clamp-2">{row.data_freshness_note}</span>
                        <Badge variant="outline" className="mt-1 border-warning/40 text-[10px] text-muted-foreground">
                          Last DB snapshot
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-tabular text-xs text-muted-foreground">
                        {row.added_at ? new Date(row.added_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-critical hover:text-critical"
                          disabled={removeMut.isPending}
                          onClick={() => removeMut.mutate(row.subject_id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </HubLayout>
  );
}
