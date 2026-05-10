import { Link } from "react-router-dom";
import type { StayListRow } from "../../api/types";
import type { StaySortDir, StaySortField } from "../../lib/sortStayRows";
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
import { Skeleton } from "@/components/ui/skeleton";

export const patientRosterLinkClass =
  "font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline";

export type PatientRosterCardProps = {
  rows: StayListRow[];
  /** Used with filters: total stays before client-side filter */
  rosterTotal?: number;
  showFilters?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  sortField?: StaySortField;
  sortDir?: StaySortDir;
  onSortFieldChange?: (value: StaySortField) => void;
  onSortDirChange?: (value: StaySortDir) => void;
  title?: string;
  isLoading?: boolean;
};

export function PatientRosterCard({
  rows,
  rosterTotal,
  showFilters = false,
  search = "",
  onSearchChange,
  sortField = "news",
  sortDir = "desc",
  onSortFieldChange,
  onSortDirChange,
  title = "ICU Patient Roster",
  isLoading = false,
}: PatientRosterCardProps) {
  const subtitle =
    showFilters && rosterTotal != null
      ? `${rows.length} of ${rosterTotal} patients`
      : `${rows.length} patient${rows.length === 1 ? "" : "s"}`;

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {showFilters && onSearchChange && onSortFieldChange && onSortDirChange ? (
            <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[min(100%,36rem)] lg:flex-row lg:flex-wrap lg:items-end lg:justify-end">
              <div className="grid w-full gap-2 lg:w-56">
                <Label htmlFor="roster-search" className="sr-only">
                  Search
                </Label>
                <Input
                  id="roster-search"
                  placeholder="Search name, patient ID, stay, diagnosis…"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
              <div className="grid w-full gap-2 sm:w-44">
                <Label className="text-xs text-muted-foreground">Sort By</Label>
                <Select value={sortField} onValueChange={(v) => onSortFieldChange(v as StaySortField)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="risk">Prediction Risk</SelectItem>
                    <SelectItem value="news">NEWS</SelectItem>
                    <SelectItem value="age">Age</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid w-full gap-2 sm:w-36">
                <Label className="text-xs text-muted-foreground">Order</Label>
                <Select value={sortDir} onValueChange={(v) => onSortDirChange(v as StaySortDir)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
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
                  <TableHead className="font-tabular">Patient ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead className="max-w-[240px]">Diagnosis</TableHead>
                  <TableHead className="text-right">ICU LOS (h)</TableHead>
                  <TableHead className="text-right">Prediction Risk</TableHead>
                  <TableHead className="text-right">NEWS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.stay_id}>
                    <TableCell className="font-tabular text-muted-foreground">
                      <Link className={patientRosterLinkClass} to={`/patients/${row.stay_id}`}>
                        {row.display_patient_id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link className={patientRosterLinkClass} to={`/patients/${row.stay_id}`}>
                        {row.patient_name}
                      </Link>
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
                    <TableCell className="text-right font-tabular">
                      {row.readmission_risk_72h != null && row.readmission_risk_72h !== undefined
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
            {rows.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                {showFilters ? "No Patients Match Your Filters." : "No Patients On The Roster."}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
