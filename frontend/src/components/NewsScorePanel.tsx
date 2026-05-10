import * as React from "react";
import type { NewsParameterScore, NewsScoreResponse } from "../api/types";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewsBandBadge } from "./StatusBadge";

export function evidenceElId(paramName: string) {
  return `ev_news_${paramName}`;
}

const ELEVATED_POINTS_THRESHOLD = 2;

function describeFactor(p: NewsParameterScore): string {
  const pts = p.points;
  const ptsLabel = `${pts} point${pts === 1 ? "" : "s"}`;
  let line = `${p.label}: measured ${p.value_display} → ${ptsLabel} toward the aggregate NEWS2 score (0–20).`;
  if (p.subscale_note) {
    line += ` ${p.subscale_note}`;
  }
  if (p.name === "spo2") {
    line += " Interpret SpO₂ with oxygen delivery if applicable.";
  }
  if (p.name === "consciousness") {
    line += " Confirm clinically if assessment differs from structured data.";
  }
  return line;
}

export function NewsScorePanel({
  data,
  compact = false,
}: {
  data: NewsScoreResponse;
  compact?: boolean;
}) {
  const elevated = React.useMemo(
    () => data.parameters.filter((p) => p.points >= ELEVATED_POINTS_THRESHOLD),
    [data.parameters],
  );

  const [selectedName, setSelectedName] = React.useState<string>(() => elevated[0]?.name ?? "");

  React.useEffect(() => {
    if (elevated.length && !elevated.some((p) => p.name === selectedName)) {
      setSelectedName(elevated[0].name);
    }
  }, [elevated, selectedName]);

  const selectedParam = elevated.find((p) => p.name === selectedName);
  const blurb = selectedParam ? describeFactor(selectedParam) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden anchors for narrative citations [ev_news_*] */}
      <div className="sr-only" aria-hidden>
        {data.parameters.map((p) => (
          <span key={p.name} id={evidenceElId(p.name)} />
        ))}
      </div>

      <Card
        className={compact ? "p-3 shadow-[var(--shadow-card)]" : "p-4 shadow-[var(--shadow-card)]"}
        data-panel="news-composite"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              NEWS aggregate (0–20)
            </p>
            <p
              className={
                compact
                  ? "mt-0.5 font-tabular text-2xl font-semibold tracking-tight text-foreground"
                  : "mt-1 font-tabular text-3xl font-semibold tracking-tight text-foreground"
              }
            >
              {data.total_score}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <NewsBandBadge band={data.clinical_risk_band} />
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="news-factors-select" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Elevated NEWS factors
        </Label>
        {elevated.length === 0 ? (
          <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
            No single parameter reaches the elevated threshold ({ELEVATED_POINTS_THRESHOLD}+ points); aggregate score still reflects all components.
          </p>
        ) : (
          <>
            <Select value={selectedName} onValueChange={setSelectedName}>
              <SelectTrigger id="news-factors-select" className="w-full max-w-md">
                <SelectValue placeholder="Choose a factor" />
              </SelectTrigger>
              <SelectContent>
                {elevated.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.label} ({p.points} pts)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {blurb && (
              <p className="max-w-xl text-sm leading-snug text-foreground">{blurb}</p>
            )}
          </>
        )}
      </div>
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
