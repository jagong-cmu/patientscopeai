import type { CurrentVitalsResponse, VitalsSeriesResponse } from "../api/types";
import { VitalsPanel } from "./VitalsPanel";
import { VitalsTrendPanel } from "./VitalsTrendPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function VitalsCombinedPanel({
  current,
  series,
}: {
  current: CurrentVitalsResponse | undefined;
  series: VitalsSeriesResponse | undefined;
}) {
  if (!current?.vitals.length && !series?.series.length) {
    return (
      <p className="text-sm text-muted-foreground">No vitals in the chart window for this stay.</p>
    );
  }

  return (
    <Tabs defaultValue="trends" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="trends">Trends</TabsTrigger>
        <TabsTrigger value="latest">Latest values</TabsTrigger>
      </TabsList>
      <TabsContent value="trends" className="mt-4">
        {series && series.series.length > 0 ? (
          <VitalsTrendPanel data={series} />
        ) : (
          <p className="text-sm text-muted-foreground">No series data.</p>
        )}
      </TabsContent>
      <TabsContent value="latest" className="mt-4">
        {current && current.vitals.length > 0 ? (
          <VitalsPanel data={current} />
        ) : (
          <p className="text-sm text-muted-foreground">No latest vitals row.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
