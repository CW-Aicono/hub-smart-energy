import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sun, MapPin, Users, ArrowRight } from "lucide-react";
import { fetchPublicListings, type PublicListingRow } from "@/lib/marketplaceApi";

export default function MarketplacePublic() {
  const [plz, setPlz] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PublicListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(filter?: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicListings(filter || undefined);
      setItems(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Energy-Sharing Marktplatz — Energiegemeinschaften finden</title>
        <meta
          name="description"
          content="Finde eine Energiegemeinschaft in deiner Region und beteilige dich am gemeinsamen Strom aus PV, Wind & Speicher."
        />
        <link rel="canonical" href="/sharing/marktplatz" />
      </Helmet>

      <header className="border-b bg-gradient-to-b from-primary/10 to-transparent">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Energy-Sharing Marktplatz</h1>
          <p className="text-muted-foreground max-w-2xl">
            Finde eine Energiegemeinschaft in deiner Region und beteilige dich an günstigem,
            lokalem Strom aus erneuerbaren Quellen — nach §42c EnWG.
          </p>
          <div className="mt-6 flex gap-2 max-w-md">
            <Input
              placeholder="PLZ (z. B. 12345)"
              value={search}
              onChange={(e) => setSearch(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
            />
            <Button
              onClick={() => {
                setPlz(search);
                load(search);
              }}
            >
              Suchen
            </Button>
            {plz && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPlz("");
                  setSearch("");
                  load();
                }}
              >
                Zurücksetzen
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-muted-foreground">Lade Angebote …</p>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {plz
                ? `Keine Energiegemeinschaft für PLZ ${plz} gefunden.`
                : "Aktuell keine öffentlichen Angebote verfügbar."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((l) => (
              <ListingCard key={l.slug} listing={l} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ListingCard({ listing }: { listing: PublicListingRow }) {
  const capacity = Number(listing.total_capacity_kw || 0);
  const members = Number(listing.current_members || 0);
  const max = listing.max_members ?? null;
  const free = max ? Math.max(max - members, 0) : null;

  return (
    <Card className="overflow-hidden flex flex-col">
      {listing.hero_image_url ? (
        <div
          className="h-40 bg-cover bg-center"
          style={{ backgroundImage: `url(${listing.hero_image_url})` }}
          aria-label={listing.title}
        />
      ) : (
        <div className="h-40 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Sun className="h-12 w-12 text-primary/60" />
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-lg">{listing.title}</CardTitle>
        <CardDescription className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {listing.region_plz ?? "—"} {listing.region_city ?? ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {listing.short_description && (
          <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{listing.short_description}</p>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="secondary">
            {Number(listing.price_ct_kwh).toLocaleString("de-DE", { minimumFractionDigits: 2 })} ct/kWh
          </Badge>
          <Badge variant="outline">
            <Sun className="h-3 w-3 mr-1" />
            {capacity.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kW
          </Badge>
          <Badge variant="outline">
            <Users className="h-3 w-3 mr-1" />
            {members.toLocaleString("de-DE")}
            {max ? ` / ${max.toLocaleString("de-DE")}` : ""}
          </Badge>
        </div>
        {free !== null && (
          <p className="text-xs text-muted-foreground mb-3">
            {free > 0 ? `${free.toLocaleString("de-DE")} freie Plätze` : "Warteliste"}
          </p>
        )}
        <Button asChild className="mt-auto" variant="default">
          <Link to={`/sharing/marktplatz/${listing.slug}`}>
            Details ansehen <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
