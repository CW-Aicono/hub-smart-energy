import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { sustainabilityKPIs } from "@/data/mockData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { Leaf, Wind, Gauge, Cloud } from "lucide-react";

interface SustainabilityKPIsProps {
  locationId: string | null;
}

const SustainabilityKPIs = ({ locationId }: SustainabilityKPIsProps) => {
  // In a real implementation, filter data by locationId
  const co2Progress = Math.round((1 - sustainabilityKPIs.co2Current / sustainabilityKPIs.co2Target) * 100 + 100);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Leaf className="h-5 w-5 text-accent" />
          Nachhaltigkeits-KPIs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Cloud className="h-4 w-4 text-accent" /> CO₂-Emissionen
            </span>
            <span className="text-sm text-muted-foreground">
              {sustainabilityKPIs.co2Current}t / {sustainabilityKPIs.co2Target}t Ziel
            </span>
          </div>
          <Progress value={Math.min(co2Progress, 100)} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            Noch {(sustainabilityKPIs.co2Current - sustainabilityKPIs.co2Target).toFixed(1)}t über dem Ziel
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Wind className="h-4 w-4 text-accent" /> Erneuerbare Energien
            </span>
            <span className="text-sm text-muted-foreground">
              {sustainabilityKPIs.renewablePercent}% / {sustainabilityKPIs.renewableTarget}%
            </span>
          </div>
          <Progress value={(sustainabilityKPIs.renewablePercent / sustainabilityKPIs.renewableTarget) * 100} className="h-2" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Gauge className="h-4 w-4 text-accent" /> Effizienz-Score
            </span>
            <span className="text-sm font-display font-bold text-accent">
              {sustainabilityKPIs.efficiencyScore}/100
            </span>
          </div>
          <Progress value={sustainabilityKPIs.efficiencyScore} className="h-2" />
        </div>

        {/* Scope 1 & 2 Breakdown */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1">
            <Cloud className="h-4 w-4 text-primary" /> CO₂ nach Scope
          </h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={[
                { name: sustainabilityKPIs.scope1.label, ist: sustainabilityKPIs.scope1.value, ziel: sustainabilityKPIs.scope1.target },
                { name: sustainabilityKPIs.scope2.label, ist: sustainabilityKPIs.scope2.value, ziel: sustainabilityKPIs.scope2.target },
              ]}
              layout="vertical"
              margin={{ left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} unit="t" />
              <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} width={120} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  color: "hsl(var(--card-foreground))",
                }}
                formatter={(v: number) => [`${v}t`, ""]}
              />
              <Legend />
              <Bar dataKey="ist" name="Ist" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="ziel" name="Ziel" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="text-xs text-muted-foreground mt-2 space-y-1">
            <p>Scope 1 ({sustainabilityKPIs.scope1.sources}): {sustainabilityKPIs.scope1.value}t / {sustainabilityKPIs.scope1.target}t Ziel</p>
            <p>Scope 2 ({sustainabilityKPIs.scope2.sources}): {sustainabilityKPIs.scope2.value}t / {sustainabilityKPIs.scope2.target}t Ziel</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SustainabilityKPIs;
