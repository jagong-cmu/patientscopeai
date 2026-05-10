import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StayListResponse } from "../api/types";
import { apiGet } from "../api/client";
import { HubLayout } from "../components/hub/HubLayout";
import { PatientRosterCard } from "../components/hub/PatientRosterCard";
import { sortStayRows, type StaySortDir, type StaySortField } from "../lib/sortStayRows";

export default function PatientsListPage() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<StaySortField>("news");
  const [sortDir, setSortDir] = useState<StaySortDir>("desc");

  const { data, isLoading, error } = useQuery({
    queryKey: ["stays"],
    queryFn: () => apiGet<StayListResponse>("/api/stays"),
    staleTime: 120_000,
    gcTime: 300_000,
  });

  const filteredActive = useMemo(() => {
    const rows = data?.stays ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!q) return true;
      if (r.display_patient_id.toLowerCase().includes(q)) return true;
      if (r.patient_name.toLowerCase().includes(q)) return true;
      if (String(r.stay_id).includes(q)) return true;
      if ((r.primary_diagnosis ?? "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [data?.stays, search]);

  const filteredPending = useMemo(() => {
    const rows = data?.pending_icu_stays ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!q) return true;
      if (r.display_patient_id.toLowerCase().includes(q)) return true;
      if (r.patient_name.toLowerCase().includes(q)) return true;
      if (String(r.stay_id).includes(q)) return true;
      if ((r.primary_diagnosis ?? "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [data?.pending_icu_stays, search]);

  const sortedActive = useMemo(
    () => sortStayRows(filteredActive, sortField, sortDir),
    [filteredActive, sortField, sortDir],
  );

  const sortedPending = useMemo(
    () => sortStayRows(filteredPending, sortField, sortDir),
    [filteredPending, sortField, sortDir],
  );

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
        <div className="space-y-6">
          <PatientRosterCard
            rows={sortedActive}
            rosterTotal={data?.stays.length}
            showFilters
            search={search}
            onSearchChange={setSearch}
            sortField={sortField}
            sortDir={sortDir}
            onSortFieldChange={setSortField}
            onSortDirChange={setSortDir}
            title="ICU Patient Roster"
            isLoading={isLoading}
          />
          {(data?.pending_icu_stays?.length ?? 0) > 0 && (
            <PatientRosterCard
              rows={sortedPending}
              rosterTotal={data?.pending_icu_stays?.length}
              showFilters
              search={search}
              onSearchChange={setSearch}
              sortField={sortField}
              sortDir={sortDir}
              onSortFieldChange={setSortField}
              onSortDirChange={setSortDir}
              title="Pending ICU Queue"
              isLoading={isLoading}
            />
          )}
        </div>
      )}
    </HubLayout>
  );
}
