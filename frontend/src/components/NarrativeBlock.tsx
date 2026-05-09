import { useMemo } from "react";
import type { NarrativeResponse } from "../api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { highlightEvidence } from "./ReadinessPanel";

const CITE_RE = /\[((?:ev_)[a-zA-Z0-9_]+)\]/g;

function parseNarrative(text: string) {
  const parts: Array<{ type: "text" | "cite"; value: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CITE_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: text.slice(last, m.index) });
    }
    parts.push({ type: "cite", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }
  return parts;
}

export function NarrativeBlock({ data }: { data: NarrativeResponse | undefined }) {
  const parts = useMemo(() => (data?.narrative ? parseNarrative(data.narrative) : []), [data?.narrative]);

  if (!data) return null;

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0 border-b border-border pb-3">
        <CardTitle className="text-base font-semibold">Clinical narrative</CardTitle>
        {data.validation_issues && data.validation_issues.length > 0 && (
          <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
            Validation notes present — review suggestions
          </span>
        )}
      </CardHeader>
      <CardContent className="pt-4 text-base leading-relaxed text-foreground">
        {parts.map((p, i) =>
          p.type === "text" ? (
            <span key={i}>{p.value}</span>
          ) : (
            <Button
              key={i}
              type="button"
              variant="outline"
              size="sm"
              className="mx-0.5 inline h-auto border-primary/30 bg-primary/5 px-1.5 py-0 font-tabular text-xs font-medium text-primary hover:bg-primary/10"
              onMouseEnter={() => highlightEvidence(p.value, true)}
              onMouseLeave={() => highlightEvidence(p.value, false)}
              onClick={() => {
                const el = document.getElementById(p.value);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                highlightEvidence(p.value, true);
                window.setTimeout(() => highlightEvidence(p.value, false), 2000);
              }}
            >
              [{p.value}]
            </Button>
          ),
        )}
      </CardContent>
    </Card>
  );
}

export function ActionRecommendations({
  narrative,
}: {
  narrative: NarrativeResponse | undefined;
}) {
  const skeleton = narrative?.reasoning_skeleton as Record<string, unknown> | undefined;
  const cats = skeleton?.recommended_action_categories;
  const fromSkeleton = Array.isArray(cats) ? cats : [];
  const fallback = narrative?.suggestions ?? [];

  const items: string[] =
    fromSkeleton.length > 0 ? fromSkeleton.map((x) => String(x)) : fallback;

  if (!items.length) return null;

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Action categories (non-directive)</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 md:grid-cols-2">
          {items.map((line, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs leading-snug text-muted-foreground"
            >
              {line}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
