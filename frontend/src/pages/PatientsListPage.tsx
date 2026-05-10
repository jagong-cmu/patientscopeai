import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NewsClinicalBand, StayListResponse } from "../api/types";
import { apiGet } from "../api/client";
import { HubLayout } from "../components/hub/HubLayout";
import { PatientRosterCard } from "../components/hub/PatientRosterCard";

export default function PatientsListPage() {
  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState<NewsClinicalBand | "all">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["stays"],
    queryFn: () => apiGet<StayListResponse>("/api/stays"),
  });

  const filtered = useMemo(() => {
    const rows = data?.stays ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (bandFilter !== "all" && r.news_band !== bandFilter) return false;
      if (!q) return true;
      if (r.display_patient_id.toLowerCase().includes(q)) return true;
      if (String(r.stay_id).includes(q)) return true;
      if ((r.primary_diagnosis ?? "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [data?.stays, search, bandFilter]);

  const subtitle = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  return (
    <HubLayout title="Patients" subtitle={subtitle}>
      {error && (
        <p className="text-sm text-critical">
          Unable to load roster. {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {(data || isLoading) && (
        <PatientRosterCard
          rows={filtered}
          rosterTotal={data?.stays.length}
          showFilters
          search={search}
          onSearchChange={setSearch}
          bandFilter={bandFilter}
          onBandFilterChange={setBandFilter}
          isLoading={isLoading}
        />
      )}
    </HubLayout>
  );
}
