import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ReadinessResponse } from "../api/types";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";

const RUBRIC_VERSION = "1.0";

function evidenceElId(componentLabel: string, index: number) {
  return `ev_readiness_${componentLabel.toLowerCase().replace(/ /g, "_")}_${index + 1}`;
}

export function ReadinessPanel({ data }: { data: ReadinessResponse }) {
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4 shadow-[var(--shadow-card)]" data-panel="readiness-composite">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Composite readiness
            </p>
            <p className="mt-1 font-tabular text-3xl font-semibold tracking-tight text-foreground">
              {data.composite_score.toFixed(2)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={data.composite_status} />
            <span className="text-[10px] text-muted-foreground">Rubric v{RUBRIC_VERSION}</span>
          </div>
        </div>
      </Card>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Components</p>
        {data.components.map((c) => (
          <Collapsible key={c.label} className="rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-secondary/60">
              <span>{c.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-tabular text-sm">{c.score.toFixed(2)}</span>
                <StatusBadge status={c.status} compact />
                <ChevronDown className="size-4 text-muted-foreground" />
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border px-3 pb-3 pt-1">
              <ul className="space-y-2">
                {c.evidence.map((line, i) => (
                  <li
                    key={i}
                    id={evidenceElId(c.label, i)}
                    className="scroll-mt-24 rounded-md border border-transparent bg-secondary/40 px-2.5 py-2 text-xs leading-snug text-muted-foreground transition-colors data-[highlight=true]:border-primary/50 data-[highlight=true]:bg-primary/5"
                  >
                    <span className="font-tabular text-[10px] text-muted-foreground/80">
                      [{evidenceElId(c.label, i)}]
                    </span>{" "}
                    {line}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <Card className="border-dashed p-3 text-xs text-muted-foreground shadow-none">
        <p className="font-medium text-foreground">24h readiness trace</p>
        <p className="mt-1">Not computed in v1 — composite is a snapshot at assessment time.</p>
      </Card>
    </div>
  );
}

export function highlightEvidence(htmlId: string, on: boolean) {
  const el = document.getElementById(htmlId);
  if (!el) return;
  if (on) {
    el.setAttribute("data-highlight", "true");
    el.classList.add("ring-2", "ring-primary");
  } else {
    el.removeAttribute("data-highlight");
    el.classList.remove("ring-2", "ring-primary");
  }
}
