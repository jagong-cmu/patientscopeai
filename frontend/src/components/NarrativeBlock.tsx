import { type ReactNode, useMemo } from "react";
import type { NarrativeResponse } from "../api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Highlight clinical-looking numbers for scanability (percentages, decimals, ranges, multi-digit values).
 * Skips isolated single digits and four-digit calendar years (1900–2099).
 */
function shouldEmphasizeNumericToken(match: string): boolean {
  if (match.includes("%")) return true;
  if (match.includes(".")) return true;
  if (/\d/.test(match) && /\s-\s/.test(match)) return true;
  if (/^\d+$/.test(match)) {
    if (match.length === 1) return false;
    if (match.length === 4) {
      const y = parseInt(match, 10);
      if (y >= 1900 && y <= 2099) return false;
    }
    return true;
  }
  return true;
}

/** Split narrative prose and wrap emphasized spans (inline-safe). */
function emphasizeClinicalValues(text: string): ReactNode[] {
  const re =
    /\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s+-\s+\d+(?:\.\d+)?|\d+\.\d+|\b\d+\b/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  const g = new RegExp(re.source, "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`t-${k++}`}>{text.slice(last, m.index)}</span>);
    }
    const token = m[0];
    const strong = shouldEmphasizeNumericToken(token);
    nodes.push(
      strong ? (
        <strong
          key={`e-${k++}`}
          className="rounded-sm bg-primary/8 px-0.5 font-semibold tabular-nums text-foreground"
        >
          {token}
        </strong>
      ) : (
        <span key={`p-${k++}`}>{token}</span>
      ),
    );
    last = m.index + token.length;
  }
  if (last < text.length) {
    nodes.push(<span key={`t-${k++}`}>{text.slice(last)}</span>);
  }
  return nodes;
}

/** Remove bracket evidence citations from narrative prose for clean reading. */
function stripEvidenceCitations(raw: string): string {
  return raw.replace(/\[(ev_[a-zA-Z0-9_]+)\]/g, "").trim();
}

function narrativeBlocks(text: string): string[] {
  const cleaned = stripEvidenceCitations(text);
  return cleaned
    .split(/\n\n+/)
    .map((p) =>
      p
        .split("\n")
        .map((line) => line.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** Short headings when the model produces multiple paragraphs (double newlines). */
function headingForBlock(index: number, total: number): string | null {
  if (total <= 1) return null;
  if (total === 2) return index === 0 ? "Overview" : "Additional notes";
  if (total === 3)
    return index === 0 ? "Overview" : index === 1 ? "Clinical considerations" : "Risk & monitoring context";
  return `Part ${index + 1}`;
}

export function NarrativeBlock({ data }: { data: NarrativeResponse | undefined }) {
  const blocks = useMemo(() => (data?.narrative ? narrativeBlocks(data.narrative) : []), [data?.narrative]);

  if (!data) return null;

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0 border-b border-border pb-3">
        <CardTitle className="text-base font-semibold">Clinical narrative</CardTitle>
        {data.validation_issues && data.validation_issues.length > 0 && (
          <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
            Validation notes present
          </span>
        )}
      </CardHeader>
      <CardContent className="pt-6">
        <article className="space-y-8">
          {blocks.map((block, i) => {
            const title = headingForBlock(i, blocks.length);
            return (
              <section key={i} className={i > 0 ? "border-t border-border pt-8" : undefined}>
                {title ? (
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
                ) : null}
                <p className="text-base leading-relaxed text-foreground">{emphasizeClinicalValues(block)}</p>
              </section>
            );
          })}
        </article>
      </CardContent>
    </Card>
  );
}

