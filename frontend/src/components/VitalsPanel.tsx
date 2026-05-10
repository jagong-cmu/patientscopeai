import type { CurrentVitalsResponse } from "../api/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatChartTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function VitalsPanel({ data }: { data: CurrentVitalsResponse }) {
  const rows = data.vitals;

  if (rows.length === 0) {
    return (
      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No charted vitals in the last 24 hours of this ICU stay for the tracked measures.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vital</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Chart time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => (
              <TableRow key={v.itemid}>
                <TableCell className="font-medium">{v.label}</TableCell>
                <TableCell className="text-right font-tabular">{v.value}</TableCell>
                <TableCell className="text-right text-muted-foreground text-xs">
                  {formatChartTime(v.charttime_iso)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
