import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "critical";

interface StatCardProps {
  label: string;
  value: string;
  delta?: { value: string; direction: "up" | "down"; positive?: boolean };
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
}

const toneClasses: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: "bg-primary/10", fg: "text-primary" },
  success: { bg: "bg-success/10", fg: "text-success" },
  warning: { bg: "bg-warning/15", fg: "text-warning" },
  critical: { bg: "bg-critical/10", fg: "text-critical" },
};

export function StatCard({ label, value, delta, icon: Icon, tone = "primary", hint }: StatCardProps) {
  const t = toneClasses[tone];
  return (
    <Card className="p-5 transition-shadow hover:shadow-[var(--shadow-elevated)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn("rounded-xl p-2.5", t.bg)}>
          <Icon className={cn("size-5", t.fg)} />
        </div>
      </div>
      {delta && (
        <div className="mt-4 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
              delta.positive ? "bg-success/10 text-success" : "bg-critical/10 text-critical",
            )}
          >
            {delta.direction === "up" ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {delta.value}
          </span>
          <span className="text-muted-foreground">snapshot</span>
        </div>
      )}
    </Card>
  );
}
