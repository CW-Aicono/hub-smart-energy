import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useCommunityMembers, type CommunityMember } from "@/hooks/useEnergyCommunities";
import SignContractDialog from "@/components/energy-sharing/SignContractDialog";

const ALLOWED_STATUSES = [
  "invited",
  "pending_idents",
  "pending_msb",
  "active",
  "suspended",
  "left",
] as const;

const STATUS_LABELS: Record<string, string> = {
  invited: "Eingeladen",
  pending_idents: "Wartet auf IDs",
  pending_msb: "Wartet auf MSB",
  active: "Aktiv",
  suspended: "Gesperrt",
  left: "Ausgetreten",
  pending: "Wartend",
};

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function EnergySharingMemberDetail() {
  const { memberId } = useParams<{ memberId: string }>();
  const { tenant } = useTenant();
  const [signOpen, setSignOpen] = useState(false);

  const { data: member, refetch } = useQuery({
    queryKey: ["community-member-detail", memberId, tenant?.id],
    enabled: !!memberId && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_members")
        .select("*")
        .eq("id", memberId!)
        .eq("tenant_id", tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any as CommunityMember & {
        invited_at: string | null;
        activated_at: string | null;
        suspended_at: string | null;
        last_invite_sent_at: string | null;
      };
    },
  });

  const { updateMember } = useCommunityMembers(member?.community_id ?? null);

  const { data: community } = useQuery({
    queryKey: ["community-name", member?.community_id],
    enabled: !!member?.community_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("energy_communities")
        .select("id,name")
        .eq("id", member!.community_id)
        .maybeSingle();
      return data;
    },
  });

  const { data: signatures = [] } = useQuery({
    queryKey: ["member-signatures", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_member_signatures")
        .select("*")
        .eq("member_id", memberId!)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const latestSig = signatures[0] as any;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-3 md:p-6 overflow-auto">
        <Link to="/energy-sharing" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" />Zurück zu Energy Sharing
        </Link>

        {!member ? (
          <p className="text-muted-foreground">Lade Mitglied …</p>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground">{member.display_name ?? "Unbenannt"}</h1>
                <p className="text-muted-foreground">
                  Community: {community?.name ?? "—"} · {member.email ?? "ohne E-Mail"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{STATUS_LABELS[member.status] ?? member.status}</Badge>
                <Select
                  value={member.status}
                  onValueChange={async (v) => {
                    await updateMember.mutateAsync({ id: member.id, status: v });
                    refetch();
                  }}
                >
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALLOWED_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row k="Mitglieds-Nr." v={member.member_no ?? "—"} />
                  <Row k="Rolle" v={<Badge variant="secondary">{member.role}</Badge>} />
                  <Row k="MaLo-ID" v={<span className="font-mono">{member.malo_id ?? "—"}</span>} />
                  <Row k="MeLo-ID" v={<span className="font-mono">{member.melo_id ?? "—"}</span>} />
                  <Row k="Anteil" v={`${Number(member.share_kw).toLocaleString("de-DE", { maximumFractionDigits: 2 })} kW`} />
                  <Row k="Beigetreten am" v={member.joined_at ?? "—"} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Vertrag</CardTitle>
                  <Button size="sm" onClick={() => setSignOpen(true)}>
                    <PenLine className="h-4 w-4 mr-1" />Erneut unterzeichnen
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {!latestSig ? (
                    <div className="space-y-3">
                      <p className="text-muted-foreground">Noch nicht unterzeichnet.</p>
                      <Button size="sm" onClick={() => setSignOpen(true)}>
                        <PenLine className="h-4 w-4 mr-1" />Jetzt unterzeichnen
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Row k="Unterzeichner" v={latestSig.signer_name} />
                      <Row k="Datum" v={fmtDate(latestSig.signed_at)} />
                      <Row k="IP-Adresse" v={<span className="font-mono">{latestSig.signer_ip ?? "—"}</span>} />
                      <Row k="Hash" v={<span className="font-mono text-xs break-all">{latestSig.body_hash}</span>} />
                      <CardDescription className="pt-2">
                        Insgesamt {signatures.length.toLocaleString("de-DE")} Unterschrift(en) hinterlegt.
                      </CardDescription>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Onboarding-Timeline</CardTitle></CardHeader>
                <CardContent>
                  <ol className="relative border-l border-border ml-2 space-y-4 pl-4">
                    <TimelineItem label="Eingeladen" ts={member.invited_at} />
                    <TimelineItem label="Letzte Einladung versendet" ts={member.last_invite_sent_at} />
                    <TimelineItem label="Aktiviert" ts={member.activated_at} />
                    <TimelineItem label="Gesperrt" ts={member.suspended_at} />
                    <TimelineItem label="Ausgetreten" ts={member.left_at} />
                  </ol>
                </CardContent>
              </Card>
            </div>

            <SignContractDialog
              open={signOpen}
              onOpenChange={setSignOpen}
              member={member}
              communityId={member.community_id}
              communityName={community?.name ?? ""}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function TimelineItem({ label, ts }: { label: string; ts: string | null | undefined }) {
  const active = !!ts;
  return (
    <li>
      <span
        className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border ${
          active ? "bg-primary border-primary" : "bg-background border-border"
        }`}
      />
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{ts ? fmtDate(ts) : "—"}</div>
    </li>
  );
}
