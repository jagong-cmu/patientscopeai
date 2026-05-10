import type { CurrentVitalsResponse, VitalsSeriesResponse } from "../api/types";
import type { VitalDemographics } from "../lib/vitalReferenceRanges";
import { VitalsPanel } from "./VitalsPanel";
import { VitalsTrendPanel } from "./VitalsTrendPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const defaultDemo: VitalDemographics = { ageYears: null, gender: null };

export function VitalsCombinedPanel({
  current,
  series,
  demographics = defaultDemo,
}: {
  current: CurrentVitalsResponse | undefined;
  series: VitalsSeriesResponse | undefined;
  demographics?: VitalDemographics;
}) {
  const demo = demographics;

  if (!current?.vitals.length && !series?.series.length) {
    return (
      <p className="text-sm text-muted-foreground">No vitals in the chart window for this stay.</p>
    );
  }

  return (
    <Tabs defaultValue="trends" className="w-full">
      <TabsList className="grid h-10 w-full grid-cols-2">
        <TabsTrigger value="trends" className="transition-transform active:scale-[0.98]">
          Trends
        </TabsTrigger>
        <TabsTrigger value="latest" className="transition-transform active:scale-[0.98]">
          Latest values
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="trends"
        className="mt-4 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1 duration-200"
      >
        {series && series.series.length > 0 ? (
          <VitalsTrendPanel data={series} demographics={demo} />
        ) : (
          <p className="text-sm text-muted-foreground">No series data.</p>
        )}
      </TabsContent>
      <TabsContent
        value="latest"
        className="mt-4 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1 duration-200"
      >
        {current && current.vitals.length > 0 ? (
          <VitalsPanel data={current} demographics={demo} />
        ) : (
          <p className="text-sm text-muted-foreground">No latest vitals row.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
