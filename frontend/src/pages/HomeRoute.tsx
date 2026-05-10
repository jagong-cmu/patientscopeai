import LandingPage from "./LandingPage";
import WardOverviewPage from "./WardOverviewPage";

/**
 * Live ward UI (non-interactive) under a translucent landing so data is already resolved
 * when the user enters /ward.
 */
export default function HomeRoute() {
  return (
    <div className="relative min-h-svh w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden>
        <div className="h-[min(100dvh,100svh)] min-h-svh overflow-hidden opacity-40 saturate-[0.9]">
          <WardOverviewPage previewBehindLanding />
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background/90 via-background/55 to-background/78"
        aria-hidden
      />
      <LandingPage />
    </div>
  );
}
