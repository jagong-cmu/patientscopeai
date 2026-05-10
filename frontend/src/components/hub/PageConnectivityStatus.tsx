import { useQuery } from "@tanstack/react-query";
import type { PatientScopeStatusResponse } from "../../api/types";
import { apiUrl } from "../../api/client";
import { cn } from "@/lib/utils";

const SLOW_DB_MS = Number(import.meta.env.VITE_STATUS_SLOW_DB_MS ?? 900);
const SLOW_TOTAL_MS = Number(import.meta.env.VITE_STATUS_SLOW_TOTAL_MS ?? 1600);

type Level = "green" | "yellow" | "red";

function resolveLevel(
  data: PatientScopeStatusResponse | undefined,
  fetchMs: number | undefined,
  isError: boolean,
  isLoading: boolean,
): Level {
  if (isError) return "red";
  if (!data && !isLoading) return "red";
  if (!data) return "yellow";
  if (!data.database_ok) return "red";
  const dbSlow = data.database_ms >= SLOW_DB_MS;
  const hopSlow = fetchMs != null && fetchMs >= SLOW_TOTAL_MS;
  if (dbSlow || hopSlow) return "yellow";
  return "green";
}

async function fetchStatus(): Promise<{ payload: PatientScopeStatusResponse; fetchMs: number }> {
  const t0 = performance.now();
  const res = await fetch(apiUrl("/api/status"), {
    headers: { Accept: "application/json" },
  });
  const fetchMs = performance.now() - t0;
  if (!res.ok) {
    throw new Error(`${res.status}`);
  }
  const payload = (await res.json()) as PatientScopeStatusResponse;
  return { payload, fetchMs };
}

/** Colored dot + short caption beside the page title (no hover required). */
export function PageConnectivityStatus() {
  const q = useQuery({
    queryKey: ["patientscope-status"],
    queryFn: fetchStatus,
    staleTime: 20_000,
    gcTime: 120_000,
    refetchInterval: 30_000,
    retry: 1,
    retryDelay: 2000,
  });

  const payload = q.data?.payload;
  const fetchMs = q.data?.fetchMs;
  const level = resolveLevel(payload, fetchMs, q.isError, q.isLoading);

  const dotClass =
    level === "green"
      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
      : level === "yellow"
        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
        : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.45)]";

  const caption =
    level === "green" ? "Systems Online" : level === "yellow" ? "Slow Response" : "Offline";

  const aria =
    level === "green"
      ? "PatientScope server online"
      : level === "yellow"
        ? "PatientScope server slow or degraded"
        : "PatientScope server unavailable";

  return (
    <div
      className="flex shrink-0 items-center gap-2 pt-1"
      role="status"
      aria-live="polite"
      aria-label={aria}
    >
      <span className={cn("size-2.5 rounded-full", dotClass, q.isLoading && "animate-pulse")} />
      <span className="text-xs font-medium tracking-tight text-muted-foreground">{caption}</span>
    </div>
  );
}
