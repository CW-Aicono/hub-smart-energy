import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, MapPin, Sun, Users, CheckCircle2 } from "lucide-react";
import {
  fetchPublicListingDetail,
  submitJoinRequest,
  type PublicListingDetail,
} from "@/lib/marketplaceApi";

export default function MarketplaceListingDetail() {
  const { slug = "" } = useParams();
  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    plz: "",
    city: "",
    message: "",
  });

  useEffect(() => {
    (async () => {
      try {
        setListing(await fetchPublicListingDetail(slug));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setSubmitting(true);
    try {
      await submitJoinRequest({
        slug,
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        message:
          [form.message, form.plz && `PLZ: ${form.plz}`, form.city && `Ort: ${form.city}`]
            .filter(Boolean)
            .join("\n") || undefined,
      });
      setSubmitted(true);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (listing?.title) {
      document.title = `${listing.title} — Energy-Sharing Marktplatz`;
    }
  }, [listing?.title]);

  if (loading) {
    return <div className="p-8 text-muted-foreground">Lade …</div>;
  }
  if (error || !listing) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <p className="text-destructive mb-4">{error ?? "Angebot nicht gefunden"}</p>
        <Button asChild variant="outline">
          <Link to="/sharing/marktplatz">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück zum Marktplatz
          </Link>
        </Button>
      </div>
    );
  }

  const capacity = Number(listing.total_capacity_kw || 0);
  const members = Number(listing.current_members || 0);
  const max = listing.max_members;
  const free = max ? Math.max(max - members, 0) : null;


  return (
    <div className="min-h-screen bg-background">


      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/sharing/marktplatz">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Zurück
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {listing.hero_image_url && (
          <div
            className="h-64 rounded-lg bg-cover bg-center"
            style={{ backgroundImage: `url(${listing.hero_image_url})` }}
          />
        )}

        <div>
          <h1 className="text-3xl font-bold mb-2">{listing.title}</h1>
          <p className="text-muted-foreground flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {listing.region_plz ?? "—"} {listing.region_city ?? ""}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Preis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {Number(listing.price_ct_kwh).toLocaleString("de-DE", { minimumFractionDigits: 2 })}{" "}
                <span className="text-xs font-normal text-muted-foreground">ct/kWh</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Einspeisung</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {Number(listing.feed_in_ct_kwh).toLocaleString("de-DE", { minimumFractionDigits: 2 })}{" "}
                <span className="text-xs font-normal text-muted-foreground">ct/kWh</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                <Sun className="h-3 w-3 inline mr-1" />
                Anlage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {capacity.toLocaleString("de-DE", { maximumFractionDigits: 1 })}{" "}
                <span className="text-xs font-normal text-muted-foreground">kW</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                <Users className="h-3 w-3 inline mr-1" />
                Mitglieder
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {members.toLocaleString("de-DE")}
                {max ? `/${max.toLocaleString("de-DE")}` : ""}
              </div>
              {free !== null && (
                <Badge variant={free > 0 ? "secondary" : "outline"} className="mt-1">
                  {free > 0 ? `${free} frei` : "Warteliste"}
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {listing.long_description && (
          <Card>
            <CardHeader>
              <CardTitle>Über diese Gemeinschaft</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed">{listing.long_description}</p>
            </CardContent>
          </Card>
        )}

        <Card id="beitritt">
          <CardHeader>
            <CardTitle>Beitrittsanfrage stellen</CardTitle>
            <CardDescription>
              Unverbindlich — du erhältst per E-Mail Rückmeldung mit Details zum Vertrag.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="text-center py-6 space-y-2">
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                <p className="font-semibold">Antrag eingegangen — vielen Dank!</p>
                <p className="text-sm text-muted-foreground">
                  Der Betreiber meldet sich in Kürze bei dir per E-Mail.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3 max-w-lg">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    required
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">E-Mail *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    maxLength={255}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="phone">Telefon</Label>
                    <Input
                      id="phone"
                      maxLength={40}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="plz">PLZ</Label>
                    <Input
                      id="plz"
                      inputMode="numeric"
                      maxLength={5}
                      value={form.plz}
                      onChange={(e) => setForm({ ...form, plz: e.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="message">Nachricht</Label>
                  <Textarea
                    id="message"
                    rows={3}
                    maxLength={2000}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Mit dem Absenden willigst du in die Kontaktaufnahme zur Anbahnung des Beitritts ein.
                </p>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Sende …" : "Beitrittsanfrage senden"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
