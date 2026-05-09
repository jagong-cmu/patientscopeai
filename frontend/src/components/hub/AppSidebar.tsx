import { NavLink } from "react-router-dom";
import { Activity, BookOpen, LayoutDashboard, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "ICU overview", icon: LayoutDashboard, to: "/", end: true },
  { label: "Methodology", icon: BookOpen, to: "/methodology", end: true },
];

export function AppSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-6">
        <div className="grid size-9 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elevated)]">
          <Stethoscope className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">PatientScope AI</p>
          <p className="text-xs text-muted-foreground">Discharge readiness</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-border bg-[image:var(--gradient-subtle)] p-4">
        <p className="text-sm font-medium">Transparency-first</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every score expands to evidence; narrative citations link back to sources.
        </p>
        <NavLink
          to="/methodology"
          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
        >
          <Activity className="size-3.5" />
          Limitations & cohort
        </NavLink>
      </div>
    </aside>
  );
}
