import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Ad-Hoc Payment (CCV) — Tab-Grundgerüst (Phase 1)
 *
 * Baut auf den neuen Tabellen payment_providers, payment_terminals,
 * adhoc_payment_sessions, payment_events, ocpi_endpoints, ocpi_tokens auf.
 * Konkrete CRUD-Formulare und der Verbindungstest folgen in Phase 2/3
 * (nach CCV Sandbox-Onboarding).
 */
const AdHocPaymentTab = () => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Ad-Hoc Payment
            <Badge variant="secondary">CCV Cloud-Connect</Badge>
          </CardTitle>
          <CardDescription>
            Kartenzahlung direkt an Ihren Ladepunkten — pflichtkonform nach AFIR
            für DC-Ladepunkte ab 50 kW. Integration über CCV Cloud-Connect (OCPI 2.2.1)
            und CCV-Kartenterminals (Edge IM15 / IM25 / IM30).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Das Modul befindet sich in der Vorbereitung. Datenbasis, Rechte
              und OCPI-Endpunkte sind angelegt. Die PSP-Konfiguration und
              Terminal-Verwaltung werden aktiviert, sobald der CCV Sandbox-Zugang
              vorliegt.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="psp" className="mt-6">
            <TabsList>
              <TabsTrigger value="psp">PSP-Verbindung</TabsTrigger>
              <TabsTrigger value="terminals">Terminals</TabsTrigger>
              <TabsTrigger value="rules">Payment-Regeln</TabsTrigger>
            </TabsList>

            <TabsContent value="psp" className="mt-4">
              <div className="rounded-md border p-6 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">CCV Cloud-Connect verbinden</p>
                <p>
                  Hier hinterlegen Sie Party-ID, Country-Code, Endpoint (Sandbox/Prod)
                  und Cloud-Connect-Token. Danach kann die Verbindung getestet und
                  die OCPI-Registrierung ausgelöst werden.
                </p>
                <p className="mt-3 text-xs">Aktivierung nach Freigabe des CCV Partner-Zugangs.</p>
              </div>
            </TabsContent>

            <TabsContent value="terminals" className="mt-4">
              <div className="rounded-md border p-6 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Kartenterminals verwalten</p>
                <p>
                  Zuordnung von CCV-Terminals (Seriennummer) zu Ladepunkten und
                  Connectoren, inkl. Status, letzter Kontaktzeit und Branding-Profil
                  (CCV Charge White-Label).
                </p>
              </div>
            </TabsContent>

            <TabsContent value="rules" className="mt-4">
              <div className="rounded-md border p-6 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Zahlungsregeln</p>
                <p>
                  Preauth-Betrag, Währung, maximale Session-Dauer, Refund-Policy
                  und Beleg-Vorlage (PDF und QR-E-Receipt).
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdHocPaymentTab;
