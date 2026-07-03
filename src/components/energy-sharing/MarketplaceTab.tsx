import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

import { Plus, Trash2, ExternalLink, Eye, UserPlus, X, Check } from "lucide-react";
import {
  useMarketplaceListings,
  useJoinRequests,
  type MarketplaceListing,
  type JoinRequest,
} from "@/hooks/useCommunityMarketplace";

interface Props {
  communityId: string;
}

const empty = {
  id: undefined as string | undefined,
  community_id: "",
  slug: "",
  title: "",
  short_description: "",
  long_description: "",
  hero_image_url: "",
  region_plz: "",
  region_city: "",
  price_ct_kwh: 0,
  feed_in_ct_kwh: 0,
  max_members: null as number | null,
  contact_email: "",
  is_public: false,
};

function toSlug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export default function MarketplaceTab({ communityId }: Props) {
  const { listings, isLoading, upsertListing, deleteListing } = useMarketplaceListings(communityId);
  const { requests, updateStatus, acceptAsMember } = useJoinRequests(communityId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty, community_id: communityId });

  function startNew() {
    setForm({ ...empty, community_id: communityId });
    setOpen(true);
  }

  function startEdit(l: MarketplaceListing) {
    setForm({
      id: l.id,
      community_id: l.community_id,
      slug: l.slug,
      title: l.title,
      short_description: l.short_description ?? "",
      long_description: l.long_description ?? "",
      hero_image_url: l.hero_image_url ?? "",
      region_plz: l.region_plz ?? "",
      region_city: l.region_city ?? "",
      price_ct_kwh: Number(l.price_ct_kwh),
      feed_in_ct_kwh: Number(l.feed_in_ct_kwh),
      max_members: l.max_members,
      contact_email: l.contact_email ?? "",
      is_public: l.is_public,
    });
    setOpen(true);
  }

  async function save() {
    const slug = form.slug.trim() || toSlug(form.title);
    if (!form.title.trim() || !slug) return;
    await upsertListing.mutateAsync({
      id: form.id,
      community_id: communityId,
      slug,
      title: form.title.trim(),
      short_description: form.short_description || null,
      long_description: form.long_description || null,
      hero_image_url: form.hero_image_url || null,
      region_plz: form.region_plz || null,
      region_city: form.region_city || null,
      price_ct_kwh: form.price_ct_kwh,
      feed_in_ct_kwh: form.feed_in_ct_kwh,
      max_members: form.max_members,
      contact_email: form.contact_email || null,
      is_public: form.is_public,
    } as any);
    setOpen(false);
  }

  const newRequests = requests.filter((r) => r.status === "new");

  type ListingsSortKey = "title" | "region" | "price" | "status" | "views";
  const { sorted: sortedListings, sort: listSort, toggle: listToggle } = useSortableData(listings, (r, k) => {
    switch (k) {
      case "title": return r.title;
      case "region": return `${r.region_plz} ${r.region_city}`;
      case "price": return Number(r.price_ct_kwh);
      case "status": return r.is_public;
      case "views": return Number(r.view_count);
      default: return null;
    }
  });
  type RequestsSortKey = "date" | "name" | "email" | "phone" | "status";
  const { sorted: sortedRequests, sort: reqSort, toggle: reqToggle } = useSortableData(requests, (r, k) => {
    switch (k) {
      case "date": return r.created_at;
      case "name": return r.name;
      case "email": return r.email;
      case "phone": return r.phone;
      case "status": return r.status;
      default: return null;
    }
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Marktplatz-Angebote</CardTitle>
            <CardDescription>
              Öffentliche Inserate für deine Energiegemeinschaft auf <code>/sharing/marktplatz</code>.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={startNew}>
                <Plus className="h-4 w-4 mr-2" />
                Angebot
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{form.id ? "Angebot bearbeiten" : "Neues Angebot"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                <div>
                  <Label>Titel *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        title: e.target.value,
                        slug: form.id ? form.slug : toSlug(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Slug (URL-Pfad)</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: toSlug(e.target.value) })}
                    placeholder="z.b. solarpark-musterstadt"
                  />
                </div>
                <div>
                  <Label>Kurzbeschreibung</Label>
                  <Textarea
                    rows={2}
                    maxLength={300}
                    value={form.short_description}
                    onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ausführliche Beschreibung</Label>
                  <Textarea
                    rows={5}
                    maxLength={4000}
                    value={form.long_description}
                    onChange={(e) => setForm({ ...form, long_description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Header-Bild URL</Label>
                  <Input
                    value={form.hero_image_url}
                    onChange={(e) => setForm({ ...form, hero_image_url: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>PLZ</Label>
                    <Input
                      value={form.region_plz}
                      onChange={(e) =>
                        setForm({ ...form, region_plz: e.target.value.replace(/\D/g, "").slice(0, 5) })
                      }
                    />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input
                      value={form.region_city}
                      onChange={(e) => setForm({ ...form, region_city: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Preis (ct/kWh) <span className="text-xs text-muted-foreground">inkl. MwSt.</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.price_ct_kwh}
                      onChange={(e) => setForm({ ...form, price_ct_kwh: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Einspeisung (ct/kWh) <span className="text-xs text-muted-foreground">inkl. MwSt.</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.feed_in_ct_kwh}
                      onChange={(e) => setForm({ ...form, feed_in_ct_kwh: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Max. Mitglieder</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.max_members ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          max_members: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Kontakt-E-Mail</Label>
                  <Input
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Switch
                    checked={form.is_public}
                    onCheckedChange={(v) => setForm({ ...form, is_public: v })}
                  />
                  <Label>Öffentlich sichtbar</Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={save} disabled={upsertListing.isPending}>
                  Speichern
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Lade …</p>
          ) : listings.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Angebote angelegt.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="title" current={listSort} onToggle={listToggle}>Titel</SortableHead>
                  <SortableHead sortKey="region" current={listSort} onToggle={listToggle}>Region</SortableHead>
                  <SortableHead sortKey="price" current={listSort} onToggle={listToggle} className="text-right">Preis</SortableHead>
                  <SortableHead sortKey="status" current={listSort} onToggle={listToggle}>Status</SortableHead>
                  <SortableHead sortKey="views" current={listSort} onToggle={listToggle} className="text-right">Aufrufe</SortableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedListings.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <button onClick={() => startEdit(l)} className="text-primary hover:underline">
                        {l.title}
                      </button>
                      <div className="text-xs text-muted-foreground">/{l.slug}</div>
                    </TableCell>
                    <TableCell>
                      {l.region_plz ?? "—"} {l.region_city ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(l.price_ct_kwh).toLocaleString("de-DE", { minimumFractionDigits: 2 })} ct
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.is_public ? "default" : "secondary"}>
                        {l.is_public ? "öffentlich" : "Entwurf"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(l.view_count).toLocaleString("de-DE")}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {l.is_public && (
                        <Button asChild variant="ghost" size="sm" title="Öffentlich ansehen">
                          <a href={`/sharing/marktplatz/${l.slug}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (await confirmDialog({ title: "Angebot löschen", description: `Angebot "${l.title}" löschen?` })) deleteListing.mutate(l.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Beitrittsanfragen
            {newRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {newRequests.length} neu
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Eingehende Anfragen aus dem Marktplatz.</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Anfragen.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="date" current={reqSort} onToggle={reqToggle}>Datum</SortableHead>
                  <SortableHead sortKey="name" current={reqSort} onToggle={reqToggle}>Name</SortableHead>
                  <SortableHead sortKey="email" current={reqSort} onToggle={reqToggle}>E-Mail</SortableHead>
                  <SortableHead sortKey="phone" current={reqSort} onToggle={reqToggle}>Telefon</SortableHead>
                  <SortableHead sortKey="status" current={listSort} onToggle={listToggle}>Status</SortableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRequests.map((r) => (
                  <JoinRow key={r.id} req={r} onAccept={acceptAsMember} onUpdate={updateStatus} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function JoinRow({
  req,
  onAccept,
  onUpdate,
}: {
  req: JoinRequest;
  onAccept: ReturnType<typeof useJoinRequests>["acceptAsMember"];
  onUpdate: ReturnType<typeof useJoinRequests>["updateStatus"];
}) {
  const date = new Date(req.created_at).toLocaleString("de-DE");
  const variant: Record<JoinRequest["status"], any> = {
    new: "default",
    contacted: "secondary",
    accepted: "default",
    rejected: "outline",
  };
  type ListingsSortKey = "title" | "region" | "price" | "status" | "views";
  const { sorted: sortedListings, sort: listSort, toggle: listToggle } = useSortableData(listings, (r, k) => {
    switch (k) {
      case "title": return r.title;
      case "region": return `${r.region_plz} ${r.region_city}`;
      case "price": return Number(r.price_ct_kwh);
      case "status": return r.is_public;
      case "views": return Number(r.view_count);
      default: return null;
    }
  });
  type RequestsSortKey = "date" | "name" | "email" | "phone" | "status";
  const { sorted: sortedRequests, sort: reqSort, toggle: reqToggle } = useSortableData(requests, (r, k) => {
    switch (k) {
      case "date": return r.created_at;
      case "name": return r.name;
      case "email": return r.email;
      case "phone": return r.phone;
      case "status": return r.status;
      default: return null;
    }
  });

  return (
    <TableRow>
      <TableCell className="text-xs">{date}</TableCell>
      <TableCell>
        <div>{req.name}</div>
        {req.message && (
          <div className="text-xs text-muted-foreground whitespace-pre-line max-w-xs truncate">
            {req.message}
          </div>
        )}
      </TableCell>
      <TableCell className="text-xs">
        <a href={`mailto:${req.email}`} className="text-primary hover:underline">
          {req.email}
        </a>
      </TableCell>
      <TableCell className="text-xs">{req.phone ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={variant[req.status]}>{req.status}</Badge>
      </TableCell>
      <TableCell className="text-right space-x-1">
        {req.status === "new" && (
          <Button
            size="sm"
            variant="ghost"
            title="Kontaktiert"
            onClick={() => onUpdate.mutate({ id: req.id, status: "contacted" })}
          >
            kontaktiert
          </Button>
        )}
        {req.status !== "accepted" && (
          <Button
            size="sm"
            variant="ghost"
            title="Als Mitglied anlegen"
            onClick={() => onAccept.mutate(req)}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
        {req.status !== "rejected" && (
          <Button
            size="sm"
            variant="ghost"
            title="Ablehnen"
            onClick={() => onUpdate.mutate({ id: req.id, status: "rejected" })}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {req.status === "accepted" && <Check className="h-4 w-4 text-primary inline" />}
      </TableCell>
    </TableRow>
  );
}
