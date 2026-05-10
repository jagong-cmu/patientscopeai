import { Link } from "react-router-dom";
import type { NewsClinicalBand, StayListRow } from "../../api/types";
import { NewsBandBadge } from "../StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";

export const patientRosterLinkClass =
  "font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline";

const BANDS: (NewsClinicalBand | "all")[] = ["all", "low", "medium", "high"];

export type PatientRosterCardProps = {
  rows: StayListRow[];
  /** Used with filters: total stays before client-side filter */
  rosterTotal?: number;
  showFilters?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  bandFilter?: NewsClinicalBand | "all";
  onBandFilterChange?: (value: NewsClinicalBand | "all") => void;
  title?: string;
  isLoading?: boolean;
};

export function PatientRosterCard({
  rows,
  rosterTotal,
  showFilters = false,
  search = "",
  onSearchChange,
  bandFilter = "all",
  onBandFilterChange,
  title = "ICU patient roster",
  isLoading = false,
}: PatientRosterCardProps) {
  const subtitle =
    showFilters && rosterTotal != null
      ? `${rows.length} of ${rosterTotal} patients`
      : `${rows.length} patient${rows.length === 1 ? "" : "s"}`;

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {showFilters && onSearchChange && onBandFilterChange ? (
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
              <div className="grid w-full gap-2 sm:w-56">
                <Label htmlFor="roster-search" className="sr-only">
                  Search
                </Label>
                <Input
                  id="roster-search"
                  placeholder="Search name, stay, diagnosis…"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
              <div className="grid w-full gap-2 sm:w-44">
                <Label className="text-xs text-muted-foreground">NEWS band</Label>
                <Select
                  value={bandFilter}
                  onValueChange={(v) => onBandFilterChange(v as NewsClinicalBand | "all")}
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
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 px-6 py-4" aria-busy="true" aria-label="Loading roster table">
            <p className="text-sm text-muted-foreground">Loading roster…</p>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Patient</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead className="max-w-[240px]">Diagnosis</TableHead>
                  <TableHead className="text-right">ICU LOS (h)</TableHead>
                  <TableHead className="text-right">NEWS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.stay_id}>
                    <TableCell>
                      <Link className={patientRosterLinkClass} to={`/patients/${row.stay_id}`}>
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
                    <TableCell
                      className="max-w-xs truncate text-muted-foreground"
                      title={row.primary_diagnosis ?? ""}
                    >
                      {row.primary_diagnosis ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-tabular">
                      {row.icu_los_hours != null ? row.icu_los_hours.toFixed(1) : "—"}
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
            {rows.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                {showFilters ? "No patients match your filters." : "No patients on the roster."}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
