import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AssessmentPage from "./pages/AssessmentPage";
import MethodologyPage from "./pages/MethodologyPage";
import PatientListPage from "./pages/PatientListPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PatientListPage />} />
          <Route path="/stay/:stayId" element={<AssessmentPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
