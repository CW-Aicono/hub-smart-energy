import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowRight, 
  MapPin, 
  LayoutDashboard, 
  Building2, 
  Zap,
  Gauge,
  Smartphone,
  QrCode,
  Camera,
  WifiOff,
  Cpu,
  RefreshCw,
  Link,
  TrendingUp,
  Battery,
  ClipboardList,
  Home,
  FileText,
  Database,
} from "lucide-react";

interface UserManualContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: "gettingStarted" | "locationManagement" | "floorManagement" | "energyAnalysis" | "meterManagement" | "mobileApp" | "automation" | "evCharging" | "integrations" | "arbitrageTrading" | "tasks" | "tenantElectricity" | "energyReport" | "dataManagement";
}

const UserManualContent = ({ open, onOpenChange, chapter }: UserManualContentProps) => {
  const { t } = useTranslation();

  const T = (key: string) => t(key as any);

  const chapters = {
    gettingStarted: {
      title: T("help.gettingStarted"),
      icon: <LayoutDashboard className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary" />
              {T("manual.gs.welcome")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.gs.welcomeText")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.gs.wizardTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.gs.wizardText")}</p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.gs.wizardStep1")}</li>
              <li>{T("manual.gs.wizardStep2")}</li>
              <li>{T("manual.gs.wizardStep3")}</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-2">{T("manual.gs.wizardHint")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.gs.dashboardTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.gs.dashboardText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.gs.dashboardItem1")}</li>
              <li>{T("manual.gs.dashboardItem2")}</li>
              <li>{T("manual.gs.dashboardItem3")}</li>
              <li>{T("manual.gs.dashboardItem4")}</li>
              <li>{T("manual.gs.dashboardItem5")}</li>
              <li>{T("manual.gs.dashboardItem6")}</li>
              <li>{T("manual.gs.dashboardItem7")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.gs.navTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.gs.navText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Dashboard:</strong> {T("manual.gs.navDashboard").replace("Dashboard: ", "")}</li>
              <li><strong>{T("nav.locations")}:</strong> {T("manual.gs.navLocations").split(": ")[1]}</li>
              <li><strong>{T("nav.meters")}:</strong> {T("manual.gs.navMeters").split(": ")[1]}</li>
              <li><strong>{T("nav.integrations")}:</strong> {T("manual.gs.navIntegrations").split(": ")[1]}</li>
              <li><strong>{T("nav.admin")}:</strong> {T("manual.gs.navUsers").split(": ")[1]}</li>
              <li><strong>{T("nav.settings")}:</strong> {T("manual.gs.navSettings").split(": ")[1]}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.gs.customizeTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.gs.customizeText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.gs.langTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.gs.langText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.gs.tenantTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.gs.tenantText")}</p>
          </section>
        </div>
      ),
    },
    locationManagement: {
      title: T("help.locationManagement"),
      icon: <MapPin className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {T("manual.loc.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.loc.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.loc.createTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.loc.createStep1")}</li>
              <li>{T("manual.loc.createStep2")}</li>
              <li>{T("manual.loc.createStep3")}
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li><strong>{T("manual.loc.typeSingle").split(": ")[0]}:</strong> {T("manual.loc.typeSingle").split(": ")[1]}</li>
                  <li><strong>{T("manual.loc.typeComplex").split(": ")[0]}:</strong> {T("manual.loc.typeComplex").split(": ")[1]}</li>
                  <li><strong>{T("manual.loc.typeOther").split(": ")[0]}:</strong> {T("manual.loc.typeOther").split(": ")[1]}</li>
                </ul>
              </li>
              <li>{T("manual.loc.createStep4")}</li>
              <li>{T("manual.loc.createStep5")}</li>
              <li>{T("manual.loc.createStep6")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.loc.editTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.loc.editText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.loc.hierarchyTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.loc.hierarchyText")}</p>
            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>Hauptstandort Berlin</span>
              </div>
              <div className="ml-6 mt-1 flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Gebäude A</span>
              </div>
              <div className="ml-6 mt-1 flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Gebäude B</span>
              </div>
            </div>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.loc.mapTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.loc.mapText")}</p>
          </section>
        </div>
      ),
    },
    floorManagement: {
      title: T("help.floorManagement"),
      icon: <Building2 className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              {T("manual.floor.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.floor.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.floor.createTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.floor.createStep1")}</li>
              <li>{T("manual.floor.createStep2")}</li>
              <li>{T("manual.floor.createStep3")}</li>
              <li>{T("manual.floor.createStep4")}</li>
              <li>{T("manual.floor.createStep5")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.floor.uploadTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.floor.uploadStep1")}</li>
              <li>{T("manual.floor.uploadStep2")}</li>
              <li>{T("manual.floor.uploadStep3")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.floor.sensorTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.floor.sensorStep1")}</li>
              <li>{T("manual.floor.sensorStep2")}</li>
              <li>{T("manual.floor.sensorStep3")}</li>
              <li>{T("manual.floor.sensorStep4")}</li>
              <li>{T("manual.floor.sensorStep5")}</li>
              <li>{T("manual.floor.sensorStep6")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.floor.dashboardTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.floor.dashboardText")}</p>
          </section>
        </div>
      ),
    },
    energyAnalysis: {
      title: T("help.energyAnalysis"),
      icon: <Zap className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {T("manual.energy.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.energy.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.energy.typesTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.energy.typesText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.energy.typeStrom")}</li>
              <li>{T("manual.energy.typeGas")}</li>
              <li>{T("manual.energy.typeWaerme")}</li>
              <li>{T("manual.energy.typeWasser")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.energy.chartsTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.energy.chartsText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.energy.chartsItem1")}</li>
              <li>{T("manual.energy.chartsItem2")}</li>
              <li>{T("manual.energy.chartsItem3")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.energy.costTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.energy.costText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.energy.filterTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.energy.filterText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.energy.exportTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.energy.exportText")}</p>
          </section>
        </div>
      ),
    },
    meterManagement: {
      title: T("help.meterManagement"),
      icon: <Gauge className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              {T("manual.meter.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.meter.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.meter.createTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.meter.createStep1")}</li>
              <li>{T("manual.meter.createStep2")}</li>
              <li>{T("manual.meter.createStep3")}
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>{T("manual.meter.typeManual")}</li>
                  <li>{T("manual.meter.typeAuto")}</li>
                </ul>
              </li>
              <li>{T("manual.meter.createStep4")}</li>
              <li>{T("manual.meter.createStep5")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.meter.editTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.meter.editText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.meter.archiveTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.meter.archiveText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.meter.archiveItem1")}</li>
              <li>{T("manual.meter.archiveItem2")}</li>
              <li>{T("manual.meter.archiveItem3")}</li>
              <li>{T("manual.meter.archiveItem4")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.meter.qrTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.meter.qrText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.meter.alertTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.meter.alertText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.meter.filterTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.meter.filterText")}</p>
          </section>
        </div>
      ),
    },
    mobileApp: {
      title: T("help.mobileApp"),
      icon: <Smartphone className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              {T("manual.mobile.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.mobile.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.mobile.accessTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.mobile.accessText")}</p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.mobile.accessStep1")}</li>
              <li>{T("manual.mobile.accessStep2")}</li>
              <li>{T("manual.mobile.accessStep3")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Camera className="h-4 w-4" />
              {T("manual.mobile.aiTitle")}
            </h4>
            <p className="text-sm text-muted-foreground">{T("manual.mobile.aiText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              {T("manual.mobile.qrTitle")}
            </h4>
            <p className="text-sm text-muted-foreground">{T("manual.mobile.qrText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.mobile.unknownTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.mobile.unknownText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <WifiOff className="h-4 w-4" />
              {T("manual.mobile.offlineTitle")}
            </h4>
            <p className="text-sm text-muted-foreground">{T("manual.mobile.offlineText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.mobile.plausiTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.mobile.plausiText")}</p>
          </section>
        </div>
      ),
    },
    automation: {
      title: T("help.automationTitle"),
      icon: <Cpu className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              {T("manual.auto.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.auto.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.auto.overviewTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.auto.overviewText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.auto.actorsTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.auto.actorsText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.auto.createTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.auto.createStep1")}</li>
              <li>{T("manual.auto.createStep2")}</li>
              <li>{T("manual.auto.createStep3")}
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>{T("manual.auto.condSensor")}</li>
                  <li>{T("manual.auto.condTime")}</li>
                  <li>{T("manual.auto.condDays")}</li>
                  <li>{T("manual.auto.condActor")}</li>
                </ul>
              </li>
              <li>{T("manual.auto.createStep4")}</li>
              <li>{T("manual.auto.createStep5")}</li>
              <li>{T("manual.auto.createStep6")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.auto.actionTypesTitle")}</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.auto.actionPulse")}</li>
              <li>{T("manual.auto.actionOn")}</li>
              <li>{T("manual.auto.actionOff")}</li>
              <li>{T("manual.auto.actionToggle")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.auto.executeTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.auto.executeText")}</p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.auto.permTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.auto.permText")}</p>
          </section>
        </div>
      ),
    },
    evCharging: {
      title: T("help.evCharging"),
      icon: <Zap className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {T("manual.ev.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.ev.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.ev.createTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.ev.createStep1")}</li>
              <li>{T("manual.ev.createStep2")}</li>
              <li>{T("manual.ev.createStep3")}</li>
              <li>{T("manual.ev.createStep4")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.ev.detailTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.ev.detailText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.ev.detailItem1")}</li>
              <li>{T("manual.ev.detailItem2")}</li>
              <li>{T("manual.ev.detailItem3")}</li>
              <li>{T("manual.ev.detailItem4")}</li>
              <li>{T("manual.ev.detailItem5")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.ev.billingTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.ev.billingText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.ev.billingItem1")}</li>
              <li>{T("manual.ev.billingItem2")}</li>
              <li>{T("manual.ev.billingItem3")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.ev.appTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.ev.appText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.ev.appItem1")}</li>
              <li>{T("manual.ev.appItem2")}</li>
              <li>{T("manual.ev.appItem3")}</li>
              <li>{T("manual.ev.appItem4")}</li>
              <li>{T("manual.ev.appItem5")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.ev.statusTitle")}</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><span className="text-green-600 font-medium">{T("manual.ev.statusAvailable")}</span></li>
              <li><span className="text-blue-600 font-medium">{T("manual.ev.statusCharging")}</span></li>
              <li><span className="text-red-600 font-medium">{T("manual.ev.statusError")}</span></li>
              <li><span className="text-yellow-600 font-medium">{T("manual.ev.statusUnavailable")}</span></li>
              <li><span className="text-orange-600 font-medium">{T("manual.ev.statusOffline")}</span></li>
            </ul>
          </section>
        </div>
      ),
    },
    integrations: {
      title: T("help.integrationsTitle"),
      icon: <Link className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Link className="h-4 w-4 text-primary" />
              {T("manual.int.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.int.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.int.gatewayTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.int.gatewayText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.int.gatewayLoxone")}</li>
              <li>{T("manual.int.gatewayShelly")}</li>
              <li>{T("manual.int.gatewayTuya")}</li>
              <li>{T("manual.int.gatewaySiemens")}</li>
              <li>{T("manual.int.gatewayHomematic")}</li>
              <li>{T("manual.int.gatewayOmada")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.int.brighthubTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.int.brighthubText")}</p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.int.brighthubStep1")}</li>
              <li>{T("manual.int.brighthubStep2")}</li>
              <li>{T("manual.int.brighthubStep3")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.int.meterSyncTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.int.meterSyncText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.int.meterSyncItem1")}</li>
              <li>{T("manual.int.meterSyncItem2")}</li>
              <li>{T("manual.int.meterSyncItem3")}</li>
              <li>{T("manual.int.meterSyncItem4")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.int.readingSyncTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.int.readingSyncText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.int.readingSyncItem1")}</li>
              <li>{T("manual.int.readingSyncItem2")}</li>
              <li>{T("manual.int.readingSyncItem3")}</li>
              <li>{T("manual.int.readingSyncItem4")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              {T("manual.int.syncStatusTitle")}
            </h4>
            <p className="text-sm text-muted-foreground">{T("manual.int.syncStatusText")}</p>
          </section>
        </div>
      ),
    },
    arbitrageTrading: {
      title: T("help.arbitrageTitle"),
      icon: <TrendingUp className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {T("manual.arb.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.arb.intro")}</p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">{T("manual.arb.dashboardTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.arb.dashboardText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.arb.dashItem1")}</li>
              <li>{T("manual.arb.dashItem2")}</li>
              <li>{T("manual.arb.dashItem3")}</li>
              <li>{T("manual.arb.dashItem4")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.arb.chartTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.arb.chartText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.arb.chartItem1")}</li>
              <li>{T("manual.arb.chartItem2")}</li>
              <li>{T("manual.arb.chartItem3")}</li>
              <li>{T("manual.arb.chartItem4")}</li>
              <li>{T("manual.arb.chartItem5")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Battery className="h-4 w-4" />
              {T("manual.arb.storageTitle")}
            </h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.arb.storageStep1")}</li>
              <li>{T("manual.arb.storageStep2")}</li>
              <li>{T("manual.arb.storageStep3")}</li>
              <li>{T("manual.arb.storageStep4")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.arb.strategyTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.arb.strategyStep1")}</li>
              <li>{T("manual.arb.strategyStep2")}</li>
              <li>{T("manual.arb.strategyStep3")}
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>{T("manual.arb.buyBelow")}</li>
                  <li>{T("manual.arb.sellAbove")}</li>
                </ul>
              </li>
              <li>{T("manual.arb.strategyStep4")}</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">{T("manual.arb.historyTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.arb.historyText")}</p>
          </section>
        </div>
      ),
    },
    tasks: {
      title: T("help.tasksTitle"),
      icon: <ClipboardList className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              {T("manual.tasks.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.tasks.intro")}</p>
          </section>
          <Separator />
          <section>
            <h4 className="font-semibold mb-2">{T("manual.tasks.createTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.tasks.createStep1")}</li>
              <li>{T("manual.tasks.createStep2")}</li>
              <li>{T("manual.tasks.createStep3")}</li>
              <li>{T("manual.tasks.createStep4")}</li>
            </ol>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.tasks.statusTitle")}</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.tasks.statusOpen")}</li>
              <li>{T("manual.tasks.statusInProgress")}</li>
              <li>{T("manual.tasks.statusDone")}</li>
            </ul>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.tasks.detailTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.tasks.detailText")}</p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.tasks.filterTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.tasks.filterText")}</p>
          </section>
        </div>
      ),
    },
    tenantElectricity: {
      title: T("help.tenantElectricityTitle"),
      icon: <Home className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              {T("manual.te.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.te.intro")}</p>
          </section>
          <Separator />
          <section>
            <h4 className="font-semibold mb-2">{T("manual.te.setupTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.te.setupStep1")}</li>
              <li>{T("manual.te.setupStep2")}</li>
              <li>{T("manual.te.setupStep3")}</li>
              <li>{T("manual.te.setupStep4")}</li>
            </ol>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.te.tenantAppTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.te.tenantAppText")}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>{T("manual.te.tenantAppItem1")}</li>
              <li>{T("manual.te.tenantAppItem2")}</li>
              <li>{T("manual.te.tenantAppItem3")}</li>
              <li>{T("manual.te.tenantAppItem4")}</li>
            </ul>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.te.billingTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.te.billingText")}</p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.te.tariffsTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.te.tariffsText")}</p>
          </section>
        </div>
      ),
    },
    energyReport: {
      title: T("help.energyReportTitle"),
      icon: <FileText className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              {T("manual.report.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.report.intro")}</p>
          </section>
          <Separator />
          <section>
            <h4 className="font-semibold mb-2">{T("manual.report.profileTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.report.profileText")}</p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.report.trendTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.report.trendText")}</p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.report.benchmarkTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.report.benchmarkText")}</p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.report.measuresTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.report.measuresText")}</p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.report.rankingTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.report.rankingText")}</p>
          </section>
        </div>
      ),
    },
    dataManagement: {
      title: T("help.dataManagementTitle"),
      icon: <Database className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              {T("manual.data.title")}
            </h3>
            <p className="text-muted-foreground mb-4">{T("manual.data.intro")}</p>
          </section>
          <Separator />
          <section>
            <h4 className="font-semibold mb-2">{T("manual.data.importTitle")}</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.data.importStep1")}</li>
              <li>{T("manual.data.importStep2")}</li>
              <li>{T("manual.data.importStep3")}</li>
              <li>{T("manual.data.importStep4")}</li>
              <li>{T("manual.data.importStep5")}</li>
            </ol>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.data.exportTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.data.exportText")}</p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.data.scheduleTitle")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{T("manual.data.scheduleText")}</p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>{T("manual.data.scheduleStep1")}</li>
              <li>{T("manual.data.scheduleStep2")}</li>
              <li>{T("manual.data.scheduleStep3")}</li>
            </ol>
          </section>
          <section>
            <h4 className="font-semibold mb-2">{T("manual.data.backupTitle")}</h4>
            <p className="text-sm text-muted-foreground">{T("manual.data.backupText")}</p>
          </section>
        </div>
      ),
    },
  };

  const currentChapter = chapters[chapter];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentChapter.icon}
            {currentChapter.title}
          </DialogTitle>
          <DialogDescription>
            {T("help.userManualDescription")}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          {currentChapter.content}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default UserManualContent;
