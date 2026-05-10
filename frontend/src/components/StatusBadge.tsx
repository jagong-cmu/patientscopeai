import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import type { NewsClinicalBand, ReadinessStatus } from "../api/types";
import { cn } from "@/lib/utils";

const styles: Record<
  ReadinessStatus,
  { className: string; label: string; Icon: typeof CheckCircle2 }
> = {
  green: {
    className: "border-success/40 bg-success/10 text-success",
    label: "Ready-leaning",
    Icon: CheckCircle2,
  },
  yellow: {
    className: "border-warning/50 bg-warning/15 text-warning-foreground",
    label: "Concerning",
    Icon: AlertTriangle,
  },
  red: {
    className: "border-critical/50 bg-critical/10 text-critical",
    label: "High concern",
    Icon: AlertTriangle,
  },
};

export function StatusBadge({ status, compact }: { status: ReadinessStatus; compact?: boolean }) {
  const cfg = styles[status] ?? styles.yellow;
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        cfg.className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {!compact && <span>{cfg.label}</span>}
    </span>
  );
}

const newsStyles: Record<
  NewsClinicalBand,
  { className: string; label: string; Icon: typeof CheckCircle2 }
> = {
  low: {
    className: "border-success/40 bg-success/10 text-success",
    label: "Low NEWS",
    Icon: CheckCircle2,
  },
  medium: {
    className: "border-warning/50 bg-warning/15 text-warning-foreground",
    label: "Medium NEWS",
    Icon: AlertTriangle,
  },
  high: {
    className: "border-critical/50 bg-critical/10 text-critical",
    label: "High NEWS",
    Icon: AlertTriangle,
  },
};

export function NewsBandBadge({ band, compact }: { band: NewsClinicalBand; compact?: boolean }) {
  const cfg = newsStyles[band] ?? newsStyles.medium;
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        cfg.className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {!compact && <span>{cfg.label}</span>}
    </span>
  );
}

export function UnknownBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      Unknown
    </span>
  );
}
