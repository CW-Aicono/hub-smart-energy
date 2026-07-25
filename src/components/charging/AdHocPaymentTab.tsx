import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProvidersPanel from "./adhoc/ProvidersPanel";
import TerminalsPanel from "./adhoc/TerminalsPanel";
import PaymentRulesPanel from "./adhoc/PaymentRulesPanel";

const AdHocPaymentTab = () => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Ad-Hoc Payment
            <Badge variant="secondary">CCV Cloud-Connect / Mock</Badge>
          </CardTitle>
          <CardDescription>
            Kartenzahlung direkt am Ladepunkt — pflichtkonform nach AFIR für DC-Ladepunkte ab 50 kW.
            Provider, Terminals und Zahlungsregeln werden hier verwaltet. Der Mock-Provider erlaubt
            End-to-End-Tests ohne PSP-Verbindung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Solange kein CCV-Sandbox-Zugang vorliegt, arbeitet der eingebaute <strong>Mock-Adapter</strong>{" "}
              (Preauth → Capture → Refund). Der CCV-Adapter wird nach Sandbox-Freigabe transparent aktiviert.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="providers" className="mt-6">
            <TabsList>
              <TabsTrigger value="providers">PSP-Verbindungen</TabsTrigger>
              <TabsTrigger value="terminals">Terminals</TabsTrigger>
              <TabsTrigger value="rules">Zahlungsregeln</TabsTrigger>
            </TabsList>
            <TabsContent value="providers" className="mt-4">
              <ProvidersPanel />
            </TabsContent>
            <TabsContent value="terminals" className="mt-4">
              <TerminalsPanel />
            </TabsContent>
            <TabsContent value="rules" className="mt-4">
              <PaymentRulesPanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdHocPaymentTab;
