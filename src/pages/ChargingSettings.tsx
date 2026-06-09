import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { OcppIntegrationContent } from "./OcppIntegration";
import ChargingInvoiceSettingsForm from "@/components/charging/ChargingInvoiceSettingsForm";
import RoamingTab from "@/components/charging/RoamingTab";

const ChargingSettings = () => {
  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Einstellungen</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            OCPP-Integration, Rechnungsdesign und Roaming für Ihre Ladeinfrastruktur
          </p>
        </div>


        <Tabs defaultValue="ocpp" className="w-full">
          <TabsList>
            <TabsTrigger value="ocpp">OCPP Integration</TabsTrigger>
            <TabsTrigger value="invoice">Rechnungsdesign</TabsTrigger>
            <TabsTrigger value="roaming">Roaming</TabsTrigger>
          </TabsList>

          <TabsContent value="ocpp" className="mt-4">
            <OcppIntegrationContent />
          </TabsContent>

          <TabsContent value="invoice" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <ChargingInvoiceSettingsForm />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roaming" className="mt-4">
            <RoamingTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ChargingSettings;
