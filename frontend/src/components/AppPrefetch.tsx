import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/api/client";
import type {
  StayListResponse,
  WardAlertsResponse,
  WardSummaryResponse,
  WatchlistListResponse,
} from "@/api/types";

const STALE_MS = 120_000;

/**
 * Warm React Query cache on boot so ward / patients / alerts feel instant after splash.
 */
export function AppPrefetch() {
  const qc = useQueryClient();

  useEffect(() => {
    void qc.prefetchQuery({
      queryKey: ["ward-summary"],
      queryFn: () => apiGet<WardSummaryResponse>("/api/ward/summary"),
      staleTime: STALE_MS,
    });
    void qc.prefetchQuery({
      queryKey: ["stays"],
      queryFn: () => apiGet<StayListResponse>("/api/stays"),
      staleTime: STALE_MS,
    });
    void qc.prefetchQuery({
      queryKey: ["ward-alerts"],
      queryFn: () => apiGet<WardAlertsResponse>("/api/ward/alerts"),
      staleTime: 60_000,
    });
    void qc.prefetchQuery({
      queryKey: ["watchlist"],
      queryFn: () => apiGet<WatchlistListResponse>("/api/watchlist"),
      staleTime: 60_000,
      retry: false,
    }).catch(() => {
      /* Mongo optional */
    });
  }, [qc]);

  return null;
}
