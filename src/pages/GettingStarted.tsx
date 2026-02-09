import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Rocket, Building2, MapPin, Gauge, CheckCircle2,
  ChevronRight, ChevronLeft, SkipForward, X,
} from "lucide-react";

const TOTAL_STEPS = 5;

const GettingStarted = () => {
  const { user, loading } = useAuth();
  const { tenant, refetch: refetchTenant } = useTenant();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 – Company profile
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Step 2 – First location
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationPostalCode, setLocationPostalCode] = useState("");
  const [locationType, setLocationType] = useState<string>("einzelgebaeude");
  const [createdLocationId, setCreatedLocationId] = useState<string | null>(null);

  // Step 3 – First meter
  const [meterName, setMeterName] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [energyType, setEnergyType] = useState("strom");
  const [meterUnit, setMeterUnit] = useState("kWh");

  // Pre-fill from tenant
  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.name || "");
      setContactEmail(tenant.contact_email || "");
      setContactPhone(tenant.contact_phone || "");
    }
  }, [tenant]);

  // Auto-set unit based on energy type
  useEffect(() => {
    const units: Record<string, string> = { strom: "kWh", gas: "m³", wasser: "m³", waerme: "kWh" };
    setMeterUnit(units[energyType] || "kWh");
  }, [energyType]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  const handleCancel = async () => {
    await markOnboardingComplete();
    navigate("/");
  };

  const markOnboardingComplete = async () => {
    await supabase
      .from("user_preferences")
      .update({ onboarding_completed: true } as any)
      .eq("user_id", user.id);
  };

  const handleFinish = async () => {
    await markOnboardingComplete();
    toast.success(t("onboarding.complete"));
    navigate("/");
  };

  const saveCompanyProfile = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      // Update tenant name + contact
      await supabase
        .from("tenants")
        .update({
          name: companyName || tenant.name,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
        })
        .eq("id", tenant.id);

      // Update profile contact person
      await supabase
        .from("profiles")
        .update({ contact_person: contactPerson || null, company_name: companyName || null })
        .eq("user_id", user.id);

      await refetchTenant();
      toast.success(t("onboarding.profileSaved"));
    } catch {
      toast.error(t("onboarding.saveFailed"));
    }
    setSaving(false);
  };

  const saveLocation = async () => {
    if (!tenant || !locationName) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("locations")
        .insert({
          tenant_id: tenant.id,
          name: locationName,
          address: locationAddress || null,
          city: locationCity || null,
          postal_code: locationPostalCode || null,
          type: locationType as any,
          is_main_location: true,
        })
        .select("id")
        .single();

      if (error) throw error;
      setCreatedLocationId(data.id);
      toast.success(t("onboarding.locationSaved"));
    } catch {
      toast.error(t("onboarding.saveFailed"));
    }
    setSaving(false);
  };

  const saveMeter = async () => {
    if (!tenant || !createdLocationId || !meterName) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("meters").insert({
        tenant_id: tenant.id,
        location_id: createdLocationId,
        name: meterName,
        meter_number: meterNumber || null,
        energy_type: energyType,
        unit: meterUnit,
        capture_type: "manual",
      });
      if (error) throw error;
      toast.success(t("onboarding.meterSaved"));
    } catch {
      toast.error(t("onboarding.saveFailed"));
    }
    setSaving(false);
  };

  const handleNext = async () => {
    if (step === 1 && companyName) await saveCompanyProfile();
    if (step === 2 && locationName) await saveLocation();
    if (step === 3 && meterName && createdLocationId) await saveMeter();
    if (step === TOTAL_STEPS - 1) {
      await handleFinish();
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const handleSkip = () => {
    if (step === TOTAL_STEPS - 1) {
      handleFinish();
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const stepIcons = [Rocket, Building2, MapPin, Gauge, CheckCircle2];

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Rocket className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-display font-bold">{t("onboarding.welcomeTitle")}</h2>
              <p className="text-muted-foreground max-w-md mx-auto">{t("onboarding.welcomeText")}</p>
            </div>
            <div className="grid gap-3 max-w-sm mx-auto text-left">
              {[
                { icon: Building2, text: t("onboarding.stepCompany") },
                { icon: MapPin, text: t("onboarding.stepLocation") },
                { icon: Gauge, text: t("onboarding.stepMeter") },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm">{text}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-display font-bold">{t("onboarding.companyTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("onboarding.companyText")}</p>
            </div>
            <div className="grid gap-4 max-w-md mx-auto">
              <div className="space-y-2">
                <Label>{t("onboarding.companyName")}</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t("onboarding.companyNamePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("onboarding.contactPerson")}</Label>
                <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder={t("onboarding.contactPersonPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("onboarding.contactEmail")}</Label>
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="info@firma.de" />
              </div>
              <div className="space-y-2">
                <Label>{t("onboarding.contactPhone")}</Label>
                <Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+49 ..." />
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-display font-bold">{t("onboarding.locationTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("onboarding.locationText")}</p>
            </div>
            <div className="grid gap-4 max-w-md mx-auto">
              <div className="space-y-2">
                <Label>{t("onboarding.locationName")} *</Label>
                <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder={t("onboarding.locationNamePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("onboarding.locationType")}</Label>
                <Select value={locationType} onValueChange={setLocationType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="einzelgebaeude">{t("onboarding.typeSingle")}</SelectItem>
                    <SelectItem value="gebaeudekomplex">{t("onboarding.typeComplex")}</SelectItem>
                    <SelectItem value="sonstiges">{t("onboarding.typeOther")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("onboarding.address")}</Label>
                <Input value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} placeholder={t("onboarding.addressPlaceholder")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("onboarding.postalCode")}</Label>
                  <Input value={locationPostalCode} onChange={(e) => setLocationPostalCode(e.target.value)} placeholder="12345" />
                </div>
                <div className="space-y-2">
                  <Label>{t("onboarding.city")}</Label>
                  <Input value={locationCity} onChange={(e) => setLocationCity(e.target.value)} placeholder={t("onboarding.cityPlaceholder")} />
                </div>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Gauge className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-display font-bold">{t("onboarding.meterTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("onboarding.meterText")}</p>
            </div>
            {!createdLocationId ? (
              <div className="text-center p-4 rounded-lg border bg-muted/30 max-w-md mx-auto">
                <p className="text-sm text-muted-foreground">{t("onboarding.meterNoLocation")}</p>
              </div>
            ) : (
              <div className="grid gap-4 max-w-md mx-auto">
                <div className="space-y-2">
                  <Label>{t("onboarding.meterName")} *</Label>
                  <Input value={meterName} onChange={(e) => setMeterName(e.target.value)} placeholder={t("onboarding.meterNamePlaceholder")} />
                </div>
                <div className="space-y-2">
                  <Label>{t("onboarding.meterNumber")}</Label>
                  <Input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} placeholder="Z-12345" />
                </div>
                <div className="space-y-2">
                  <Label>{t("onboarding.energyType")}</Label>
                  <Select value={energyType} onValueChange={setEnergyType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strom">{t("onboarding.energyStrom")}</SelectItem>
                      <SelectItem value="gas">{t("onboarding.energyGas")}</SelectItem>
                      <SelectItem value="wasser">{t("onboarding.energyWasser")}</SelectItem>
                      <SelectItem value="waerme">{t("onboarding.energyWaerme")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("onboarding.unit")}</Label>
                  <Input value={meterUnit} onChange={(e) => setMeterUnit(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        );
      case 4:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-accent" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-display font-bold">{t("onboarding.doneTitle")}</h2>
              <p className="text-muted-foreground max-w-md mx-auto">{t("onboarding.doneText")}</p>
            </div>
            <div className="grid gap-2 max-w-sm mx-auto text-left text-sm">
              {companyName && (
                <div className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                  <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                  <span>{t("onboarding.doneCompany")}: <strong>{companyName}</strong></span>
                </div>
              )}
              {createdLocationId && locationName && (
                <div className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                  <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                  <span>{t("onboarding.doneLocation")}: <strong>{locationName}</strong></span>
                </div>
              )}
              {meterName && createdLocationId && (
                <div className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                  <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                  <span>{t("onboarding.doneMeter")}: <strong>{meterName}</strong></span>
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6 sm:p-8">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">
                {t("onboarding.step")} {step + 1} / {TOTAL_STEPS}
              </span>
              <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground" onClick={handleCancel}>
                <X className="h-3 w-3" />
                {t("onboarding.cancel")}
              </Button>
            </div>
            <Progress value={progress} className="h-2" />
            {/* Step indicators */}
            <div className="flex justify-between mt-3">
              {stepIcons.map((Icon, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors ${
                    i <= step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="min-h-[320px] flex flex-col justify-center">
            {renderStep()}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              disabled={step === 0 || saving}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("onboarding.back")}
            </Button>
            <div className="flex gap-2">
              {step > 0 && step < TOTAL_STEPS - 1 && (
                <Button variant="ghost" onClick={handleSkip} disabled={saving} className="gap-1 text-muted-foreground">
                  <SkipForward className="h-4 w-4" />
                  {t("onboarding.skip")}
                </Button>
              )}
              <Button onClick={handleNext} disabled={saving} className="gap-1">
                {saving ? (
                  <span className="animate-pulse">{t("common.loading")}</span>
                ) : step === TOTAL_STEPS - 1 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {t("onboarding.finish")}
                  </>
                ) : (
                  <>
                    {t("onboarding.next")}
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GettingStarted;
