import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function NarrativeLoading() {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <div className="relative grid place-items-center">
          <span className="absolute size-12 rounded-full border-2 border-muted border-t-primary opacity-40" />
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Generating clinical narrative… This may take up to two minutes.
        </p>
        <div className="flex w-full max-w-md flex-col gap-2">
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="h-2 w-[85%] animate-pulse rounded bg-muted" />
          <div className="h-2 w-[65%] animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}
