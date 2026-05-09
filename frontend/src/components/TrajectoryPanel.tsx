import type { TrajectoryResponse } from "../api/types";
import { TrajectoryMiniChart } from "./TrajectoryMiniChart";

export function TrajectoryPanel({ data }: { data: TrajectoryResponse }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-snug text-muted-foreground">{data.disclaimer}</p>
      <div className="grid grid-cols-2 gap-2">
        {data.series.map((s) => (
          <TrajectoryMiniChart key={s.series_id} series={s} />
        ))}
      </div>
    </div>
  );
}
