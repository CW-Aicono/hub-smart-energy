import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
const schema = z.object({ tenant_id: z.string().uuid(), product_kind: z.enum(["module","package","unit"]), product_code: z.string().regex(/^[a-z0-9_]{2,64}$/), quantity: z.number().int().min(1).max(100000), cadence: z.enum(["once","monthly","quarterly","halfyearly"]), sale_price: z.number().finite().min(0).max(1000000), starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), payment_method: z.enum(["invoice","sepa"]), request_id: z.string().uuid(), price_reason: z.string().trim().max(500).optional(), term_months: z.number().int().min(1).max(240).nullable().optional(), auto_renew: z.boolean().optional() });
const endSchema = z.object({ action: z.literal("end"), sale_id: z.string().uuid() });
Deno.serve(async req => {
  const json = (b: unknown, status=200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type":"application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error:"Method not allowed" },405);
  try {
    const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_ANON_KEY"); const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key || !service) throw new Error("Konfiguration fehlt");
    const authorization = req.headers.get("Authorization") || "";
    const client = createClient(url,key,{global:{headers:{Authorization:authorization}}});
    const { data:{user} } = await client.auth.getUser(); if (!user) return json({error:"Nicht angemeldet"},401);
    const raw = await req.json().catch(() => ({}));
    const admin=createClient(url,service);
    const setModule = async (portal: boolean, tenant: string, code: string, enabled: boolean) => {
      const fn=portal?"portal-set-tenant-module":"partner-set-tenant-module";
      const body=portal?{tenant_id:tenant,module_code:code,enabled}:{tenantId:tenant,moduleCode:code,enabled};
      const response=await fetch(`${url}/functions/v1/${fn}`,{method:"POST",headers:{Authorization:authorization,apikey:key,"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json().catch(()=>({}));
      return response.ok&&!result.error&&result.success!==false ? null : (result.error||`Modul ${code} konnte nicht geschaltet werden`);
    };

    // Kündigen: Vertrag beenden, dann nur Module abschalten, die kein anderes Paket abdeckt und die nicht als Einzelfreischaltung markiert sind.
    const end = endSchema.safeParse(raw);
    if (end.success) {
      const {data:sale}=await admin.from("license_sales").select("id,tenant_id,product_kind,product_code,partner_id").eq("id",end.data.sale_id).maybeSingle();
      if(!sale) return json({error:"Vertrag fehlt"},404);
      const {error:endError}=await client.rpc("end_license_sale",{p_sale:sale.id}); // prüft Berechtigung
      if(endError) return json({error:endError.message},400);
      if(sale.product_kind!=="package") return json({success:true,disabled:[]});
      const {data:portal}=await client.rpc("can_portal_write",{_uid:user.id,_area:"commercial"});
      const [{data:mods},{data:defs},{data:sales},{data:bookings},{data:tms}]=await Promise.all([
        admin.from("pricing_package_modules").select("package_code,module_code"),
        admin.from("pricing_packages").select("code,always_active"),
        admin.from("license_sales").select("product_kind,product_code").eq("tenant_id",sale.tenant_id).is("ended_on",null),
        admin.from("tenant_package_bookings").select("package_code").eq("tenant_id",sale.tenant_id).is("cancelled_at",null),
        admin.from("tenant_modules").select("module_code,is_enabled,individual_grant").eq("tenant_id",sale.tenant_id),
      ]);
      const still=new Set<string>([...(defs||[]).filter(d=>d.always_active).map(d=>d.code),...(sales||[]).filter(s=>s.product_kind==="package").map(s=>s.product_code),...(bookings||[]).map(b=>b.package_code)]);
      const covered=new Set((mods||[]).filter(m=>still.has(m.package_code)).map(m=>m.module_code));
      const individual=new Set((tms||[]).filter(t=>t.individual_grant).map(t=>t.module_code));
      const enabled=new Set((tms||[]).filter(t=>t.is_enabled).map(t=>t.module_code));
      const targets=(mods||[]).filter(m=>m.package_code===sale.product_code).map(m=>m.module_code).filter(c=>enabled.has(c)&&!covered.has(c)&&!individual.has(c));
      const failed:string[]=[];
      for(const c of targets){ const err=await setModule(!!portal,sale.tenant_id,c,false); if(err) failed.push(c); }
      return json({success:true,disabled:targets.filter(c=>!failed.includes(c)),failed});
    }

    const parsed = schema.safeParse(raw); if (!parsed.success) return json({error:"Ungültige Verkaufsdaten"},400); const p=parsed.data;
    const {data: t,error:te}=await admin.from("tenants").select("partner_id").eq("id",p.tenant_id).is("deleted_at",null).single(); if(te||!t) return json({error:"Kunde fehlt"},404);
    const {data:portal}=await client.rpc("can_portal_write",{_uid:user.id,_area:"commercial"});
    const {data:partner}=t.partner_id ? await client.rpc("can_manage_partner_billing",{p_partner:t.partner_id}):{data:false};
    if(!portal&&!partner) return json({error:"Keine Berechtigung"},403);
    // Listenpreis: Direktkunde UVP, Partnerkunde (Wiederverkauf) EK. Abweichung nur mit Begründung.
    let listPrice: number | null = null;
    if(p.product_kind==="package"){const {data:d}=await admin.from("pricing_packages").select("uvp,ek").eq("code",p.product_code).maybeSingle(); if(d) listPrice=Number(t.partner_id?d.ek:d.uvp);}
    else if(p.product_kind==="unit"){const {data:u}=await admin.from("pricing_unit_prices").select("uvp,ek,new_sale_uvp").eq("code",p.product_code).maybeSingle(); if(u) listPrice=Number(t.partner_id?u.ek:(u.new_sale_uvp??u.uvp));}
    const individual = listPrice!=null && Math.abs(listPrice-p.sale_price)>0.004;
    if(individual && (p.price_reason??"").length<5) return json({error:"Abweichender Preis: Begründung (mind. 5 Zeichen) angeben"},400);
    const args={p_tenant:p.tenant_id,p_kind:p.product_kind,p_code:p.product_code,p_quantity:p.quantity,p_cadence:p.cadence,p_price:p.sale_price,p_start:p.starts_on,p_payment:p.payment_method,p_request:p.request_id};
    const {data:existing,error:preflightError}=await client.rpc("preflight_license_sale",args);
    if(preflightError)return json({error:preflightError.message},400);
    if(existing)return json({id:existing});
    if(p.product_kind==="module") return json({error:"Neue Verkäufe nur als Paket"},400);
    let modules:string[]=[];
    if(p.product_kind==="package") {
      const {data:def}=await admin.from("pricing_packages").select("requires_package,requires_any_other").eq("code",p.product_code).eq("active",true).eq("always_active",false).single(); if(!def) return json({error:"Paket nicht buchbar"},400);
      const {data:mods,error}=await admin.from("pricing_package_modules").select("module_code").eq("package_code",p.product_code); if(error) throw error; modules=(mods||[]).map(x=>x.module_code);
    }
    const {data:oldModules,error:oldError}=await admin.from("tenant_modules").select("module_code,is_enabled").eq("tenant_id",p.tenant_id).in("module_code",modules.length?modules:["__none__"]);
    if(oldError)throw oldError;
    const granted:string[]=[];
    const rollback=async()=>{for(const code of granted) await setModule(!!portal,p.tenant_id,code,false);};
    for(const code of modules) {
      if((oldModules||[]).some(m=>m.module_code===code&&m.is_enabled))continue;
      const err=await setModule(!!portal,p.tenant_id,code,true);
      if(err){await rollback();return json({error:err},400);}
      granted.push(code);
    }
    const {data,error}=await client.rpc("finalize_license_sale",args);
    if(error){await rollback();return json({error:error.message},400);}
    if(individual) await admin.from("license_sales").update({price_individual:true,price_reason:p.price_reason}).eq("id",data);
    if(p.term_months!=null||p.auto_renew===false){const {error:termError}=await client.rpc("set_license_sale_term",{p_sale:data,p_term_months:p.term_months??null,p_auto_renew:p.auto_renew??true}); if(termError) return json({id:data,warning:"Laufzeit nicht gespeichert: "+termError.message});}
    return json({id:data});
  } catch(e) { return json({error:(e as Error).message},500); }
});
