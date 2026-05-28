import { useGetMe, useListSavedPoints, getListSavedPointsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Map } from "lucide-react";
import { useEffect } from "react";

export default function Saved() {
  const [, setLocation] = useLocation();
  const { data: user, isError } = useGetMe();
  const { data: points, isLoading } = useListSavedPoints({ query: { queryKey: getListSavedPointsQueryKey(), enabled: !!user } });

  useEffect(() => {
    if (isError) setLocation("/login");
  }, [isError, setLocation]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center mb-8 gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/map")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-3xl font-bold">Saqlangan joylar</h1>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="h-32 animate-pulse bg-muted" />
          ))}
        </div>
      ) : points?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
          <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Hozircha saqlangan joylar yo'q.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {points?.map(point => (
            <Card key={point.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{point.name}</CardTitle>
                <div className="text-sm text-muted-foreground line-clamp-2">{point.description}</div>
              </CardHeader>
              <CardContent className="pt-0 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs"
                  onClick={() => setLocation(`/map?pointId=${point.id}`)}>
                  <Map className="w-3.5 h-3.5" /> Xaritada ko'r
                </Button>
                <Button size="sm" variant="ghost" className="flex-1 gap-1.5 text-xs"
                  onClick={() => setLocation(`/vizitka/${point.vizitkaCode}`)}>
                  <MapPin className="w-3.5 h-3.5" /> Vizitka
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
