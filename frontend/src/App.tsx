import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import PatientDetailPage from "./pages/PatientDetailPage";
import PatientsListPage from "./pages/PatientsListPage";
import WardOverviewPage from "./pages/WardOverviewPage";
import PostMonitoringPage from "./pages/PostMonitoringPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function LegacyStayRedirect() {
  const { stayId } = useParams();
  return <Navigate to={`/patients/${stayId ?? ""}`} replace />;
}

function LegacyWatchlistRedirect() {
  return <Navigate to="/post-monitoring" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <BrowserRouter>
          <Toaster richColors position="top-center" />
          <Routes>
            <Route path="/" element={<WardOverviewPage />} />
            <Route path="/patients" element={<PatientsListPage />} />
            <Route path="/patients/:stayId" element={<PatientDetailPage />} />
            <Route path="/post-monitoring" element={<PostMonitoringPage />} />
            <Route path="/watchlist" element={<LegacyWatchlistRedirect />} />
            <Route path="/stay/:stayId" element={<LegacyStayRedirect />} />
            <Route path="/methodology" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SidebarProvider>
    </QueryClientProvider>
  );
}
