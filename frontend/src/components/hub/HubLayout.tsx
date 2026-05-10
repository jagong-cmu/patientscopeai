import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ClinicalSidebar } from "./AppSidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageConnectivityStatus } from "./PageConnectivityStatus";

const showProdApiMissingBanner =
  import.meta.env.PROD &&
  !(import.meta.env.VITE_API_BASE && String(import.meta.env.VITE_API_BASE).trim());

export function HubLayout({
  children,
  title,
  subtitle,
  topbarBack,
  topbarCenter,
  splashBackdrop = false,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  topbarBack?: { label: string; href: string };
  topbarCenter?: string;
  /** Landing splash: omit sidebar + trigger so Radix layout stays stable behind overlay */
  splashBackdrop?: boolean;
}) {
  return (
    <>
      {!splashBackdrop ? <ClinicalSidebar /> : null}
      <SidebarInset className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
          {!splashBackdrop ? <SidebarTrigger className="-ml-1" /> : <div className="w-9 shrink-0" aria-hidden />}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {topbarBack && (
              <Button variant="ghost" size="sm" className="shrink-0" asChild>
                <Link to={topbarBack.href}>{topbarBack.label}</Link>
              </Button>
            )}
            {topbarCenter && (
              <p className="hidden truncate text-sm font-medium text-foreground md:block lg:hidden">{topbarCenter}</p>
            )}
          </div>
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">PA</AvatarFallback>
          </Avatar>
        </header>
        <div className="flex flex-1 flex-col">
          <main className="flex-1 space-y-6 p-6">
            {showProdApiMissingBanner && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Can&apos;t reach the server</AlertTitle>
                <AlertDescription>
                  Check that this app is pointed at a running API in your deployment settings.
                </AlertDescription>
              </Alert>
            )}
            {(title ?? subtitle) && (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
                  {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
                </div>
                <PageConnectivityStatus />
              </div>
            )}
            {children}
          </main>
        </div>
      </SidebarInset>
    </>
  );
}
