import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LayoutDashboard, ListPlus } from "lucide-react";
import type { NewsClinicalBand, StayListResponse } from "../api/types";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const patientLinkClass =
  "font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline";

const BANDS: (NewsClinicalBand | "all")[] = ["all", "low", "medium", "high"];

export default function PatientsListPage() {
  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState<NewsClinicalBand | "all">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["stays"],
    queryFn: () => apiGet<StayListResponse>("/api/stays"),
  });

  const filtered = useMemo(() => {
    const rows = data?.stays ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (bandFilter !== "all" && r.news_band !== bandFilter) return false;
      if (!q) return true;
      if (r.display_patient_id.toLowerCase().includes(q)) return true;
      if (String(r.stay_id).includes(q)) return true;
      if ((r.primary_diagnosis ?? "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [data?.stays, search, bandFilter]);

  const subtitle = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  return (
    <HubLayout title="Patients" subtitle={subtitle}>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <LayoutDashboard className="mr-1.5 size-4" />
            Ward overview
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/post-monitoring">
            <ListPlus className="mr-1.5 size-4" />
            Post-monitoring
          </Link>
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-critical">
          Unable to load roster. {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {data && (
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-lg">ICU patient roster</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {filtered.length} of {data.stays.length} patients
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
                <div className="grid w-full gap-2 sm:w-56">
                  <Label htmlFor="roster-search" className="sr-only">
                    Search
                  </Label>
                  <Input
                    id="roster-search"
                    placeholder="Search name, stay, diagnosis…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="grid w-full gap-2 sm:w-44">
                  <Label className="text-xs text-muted-foreground">NEWS band</Label>
                  <Select
                    value={bandFilter}
                    onValueChange={(v) => setBandFilter(v as NewsClinicalBand | "all")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BANDS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b === "all" ? "All bands" : b.charAt(0).toUpperCase() + b.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Patient</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead className="max-w-[240px]">Diagnosis</TableHead>
                  <TableHead className="text-right">ICU LOS (h)</TableHead>
                  <TableHead className="text-right">NEWS</TableHead>
                  <TableHead>Band</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.stay_id}>
                    <TableCell>
                      <Link className={patientLinkClass} to={`/patients/${row.stay_id}`}>
                        {row.display_patient_id}
                      </Link>
                      {row.is_demo ? (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Demo
                        </Badge>
                      ) : null}
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
                    <TableCell className="text-right font-tabular">{row.news_total}</TableCell>
                    <TableCell>
                      <NewsBandBadge band={row.news_band} compact />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">No patients match your filters.</p>
            )}
          </CardContent>
        </Card>
      )}
    </HubLayout>
  );
}
