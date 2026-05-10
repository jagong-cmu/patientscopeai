import { NavLink, useMatch } from "react-router-dom";
import { LayoutDashboard, Stethoscope, Users, Eye } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const nav = [
  { label: "Ward Overview", icon: LayoutDashboard, to: "/ward", end: true },
  { label: "Patients", icon: Users, to: "/patients", end: true },
  { label: "Post-Monitoring", icon: Eye, to: "/post-monitoring", end: true },
] as const;

function SidebarNavItem({
  item,
}: {
  item: { label: string; icon: (typeof nav)[number]["icon"]; to: string; end: boolean };
}) {
  const match = useMatch({ path: item.to, end: item.end });
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={!!match}
        size="lg"
        variant="outline"
        className="rounded-xl shadow-sm transition-shadow hover:shadow-md data-[active=true]:shadow-md [&>svg]:size-5"
      >
        <NavLink to={item.to} end={item.end}>
          <Icon />
          <span>{item.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function ClinicalSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elevated)]">
            <Stethoscope className="size-5" />
          </div>
          <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">PatientScope</p>
            <p className="truncate text-xs text-muted-foreground">ICU Support</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {nav.map((item) => (
                <SidebarNavItem key={item.to} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
