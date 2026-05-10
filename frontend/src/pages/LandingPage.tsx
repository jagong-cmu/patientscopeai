import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const navigate = useNavigate();
  const [spotlight, setSpotlight] = useState({ x: 50, y: 42 });

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / Math.max(r.width, 1)) * 100;
    const y = ((e.clientY - r.top) / Math.max(r.height, 1)) * 100;
    setSpotlight({ x, y });
  }, []);

  const goWard = () => {
    navigate("/ward");
  };

  return (
    <div
      className="relative z-10 flex min-h-svh w-full touch-pan-y flex-col overflow-hidden"
      onPointerMove={onPointerMove}
    >
      <div
        className="landing-mesh-animate pointer-events-none absolute -left-[30%] -right-[30%] top-[-20%] h-[85%] opacity-[0.45] blur-3xl motion-reduce:opacity-25"
        style={{
          background: `
            radial-gradient(ellipse 75% 55% at 25% 35%, oklch(0.68 0.14 215 / 0.45), transparent 58%),
            radial-gradient(ellipse 65% 50% at 78% 62%, oklch(0.62 0.16 265 / 0.35), transparent 52%)
          `,
        }}
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.75] motion-reduce:opacity-40"
        style={{
          background: `
            radial-gradient(ellipse 95% 80% at ${spotlight.x}% ${spotlight.y}%,
              oklch(0.58 0.16 220 / 0.22),
              transparent 48%)
          `,
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          PatientScope AI
        </h1>
        <p className="mt-3 max-w-sm text-pretty text-sm text-muted-foreground">ICU decision support</p>
        <Button
          type="button"
          className="mt-12 min-w-[13rem] rounded-full px-10 shadow-md shadow-primary/15 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
          size="lg"
          onClick={goWard}
        >
          Enter ward overview
        </Button>
      </div>
    </div>
  );
}
