import { Link } from "react-router-dom";
import { ArrowLeft, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function AppTopbar({
  backTo,
  centerTitle,
}: {
  backTo?: { label: string; href: string };
  centerTitle?: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {backTo && (
          <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" asChild>
            <Link to={backTo.href}>
              <ArrowLeft className="size-4" />
              {backTo.label}
            </Link>
          </Button>
        )}
        {centerTitle && (
          <p className="hidden truncate text-sm font-medium text-foreground md:block lg:hidden">{centerTitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="icon" className="relative" disabled aria-hidden>
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-critical" />
        </Button>
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">PA</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
