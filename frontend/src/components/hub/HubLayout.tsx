import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";

const showProdApiMissingBanner =
  import.meta.env.PROD &&
  !(import.meta.env.VITE_API_BASE && String(import.meta.env.VITE_API_BASE).trim());

export function HubLayout({
  children,
  title,
  subtitle,
  topbarBack,
  topbarCenter,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  topbarBack?: { label: string; href: string };
  topbarCenter?: string;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar backTo={topbarBack} centerTitle={topbarCenter} />
        <main className="flex-1 space-y-6 p-6">
          {showProdApiMissingBanner && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Backend URL not set</AlertTitle>
              <AlertDescription>
                The roster calls your FastAPI server. For static hosting, add{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">VITE_API_BASE</code>{" "}
                (your API origin, no trailing slash) in Vercel → Environment Variables, then redeploy.
              </AlertDescription>
            </Alert>
          )}
          {(title ?? subtitle) && (
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                <span className="size-2 animate-pulse rounded-full bg-success" />
                Live · PatientScope AI
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
