import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import PatientDetailPage from "./pages/PatientDetailPage";
import PatientsListPage from "./pages/PatientsListPage";
import { AppPrefetch } from "./components/AppPrefetch";
import HomeRoute from "./pages/HomeRoute";
import WardOverviewPage from "./pages/WardOverviewPage";
import PostMonitoringPage from "./pages/PostMonitoringPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 120_000,
      gcTime: 1_800_000,
      retry: 1,
      refetchOnWindowFocus: false,
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
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <BrowserRouter>
            <AppPrefetch />
            <Toaster richColors position="top-center" />
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/ward" element={<WardOverviewPage />} />
              <Route path="/patients" element={<PatientsListPage />} />
              <Route path="/patients/:stayId" element={<PatientDetailPage />} />
              <Route path="/post-monitoring" element={<PostMonitoringPage />} />
              <Route path="/watchlist" element={<LegacyWatchlistRedirect />} />
              <Route path="/stay/:stayId" element={<LegacyStayRedirect />} />
              <Route path="/methodology" element={<Navigate to="/ward" replace />} />
            </Routes>
          </BrowserRouter>
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
