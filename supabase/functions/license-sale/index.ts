import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
const schema = z.object({ tenant_id: z.string().uuid(), product_kind: z.enum(["module","package","unit"]), product_code: z.string().regex(/^[a-z0-9_]{2,64}$/), quantity: z.number().int().min(1).max(100000), cadence: z.enum(["once","monthly","quarterly","halfyearly"]), sale_price: z.number().finite().min(0).max(1000000), starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), payment_method: z.enum(["invoice","sepa"]), request_id: z.string().uuid() });
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
    const parsed = schema.safeParse(await req.json()); if (!parsed.success) return json({error:"Ungültige Verkaufsdaten"},400); const p=parsed.data;
    const admin=createClient(url,service);
    const {data: t,error:te}=await admin.from("tenants").select("partner_id").eq("id",p.tenant_id).is("deleted_at",null).single(); if(te||!t) return json({error:"Kunde fehlt"},404);
    const {data:portal}=await client.rpc("can_portal_write",{_uid:user.id,_area:"commercial"});
    const {data:partner}=t.partner_id ? await client.rpc("can_manage_partner_billing",{p_partner:t.partner_id}):{data:false};
    if(!portal&&!partner) return json({error:"Keine Berechtigung"},403);
    const args={p_tenant:p.tenant_id,p_kind:p.product_kind,p_code:p.product_code,p_quantity:p.quantity,p_cadence:p.cadence,p_price:p.sale_price,p_start:p.starts_on,p_payment:p.payment_method,p_request:p.request_id};
    const {data:existing,error:preflightError}=await client.rpc("preflight_license_sale",args);
    if(preflightError)return json({error:preflightError.message},400);
    if(existing)return json({id:existing});
    let modules:string[]=[];
    if(p.product_kind==="package") {
      const {data:def}=await admin.from("pricing_packages").select("requires_package,requires_any_other").eq("code",p.product_code).eq("active",true).eq("always_active",false).single(); if(!def) return json({error:"Paket nicht buchbar"},400);
      const {data:rows}=await admin.from("license_sales").select("product_code").eq("tenant_id",p.tenant_id).eq("product_kind","package").is("ended_on",null);
      const {data:bookings}=await admin.from("tenant_package_bookings").select("package_code").eq("tenant_id",p.tenant_id).is("cancelled_at",null);
      const active=new Set([...(rows||[]).map(x=>x.product_code),...(bookings||[]).map(x=>x.package_code)]);
      if(def.requires_package&&!active.has(def.requires_package)) return json({error:"Benötigtes Paket zuerst buchen"},400);
      if(def.requires_any_other&&active.size===0) return json({error:"Mindestens ein weiteres Paket erforderlich"},400);
      const {data:mods,error}=await admin.from("pricing_package_modules").select("module_code").eq("package_code",p.product_code); if(error) throw error; modules=(mods||[]).map(x=>x.module_code);
    } else modules=[p.product_kind==="unit" ? p.product_code==="charge_point"?"ev_charging":"locations" : p.product_code];
    const {data:oldModules,error:oldError}=await admin.from("tenant_modules").select("module_code,is_enabled").eq("tenant_id",p.tenant_id).in("module_code",modules);
    if(oldError)throw oldError;
    const granted:string[]=[];
    const rollback=async()=>{for(const code of granted){const fn=portal?"portal-set-tenant-module":"partner-set-tenant-module";const body=portal?{tenant_id:p.tenant_id,module_code:code,enabled:false}:{tenantId:p.tenant_id,moduleCode:code,enabled:false};await fetch(`${url}/functions/v1/${fn}`,{method:"POST",headers:{Authorization:authorization,apikey:key,"Content-Type":"application/json"},body:JSON.stringify(body)});}};
    for(const code of modules) {
      if((oldModules||[]).some(m=>m.module_code===code&&m.is_enabled))continue;
      const fn=portal?"portal-set-tenant-module":"partner-set-tenant-module";
      const body=portal?{tenant_id:p.tenant_id,module_code:code,enabled:true}:{tenantId:p.tenant_id,moduleCode:code,enabled:true};
      const response=await fetch(`${url}/functions/v1/${fn}`,{method:"POST",headers:{Authorization:authorization,apikey:key,"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json(); if(!response.ok||result.error||result.success===false){await rollback();return json({error:result.error||"Freigabe fehlgeschlagen"},400);}
      granted.push(code);
    }
    const {data,error}=await client.rpc("finalize_license_sale",args);
    if(error){await rollback();return json({error:error.message},400);} return json({id:data});
  } catch(e) { return json({error:(e as Error).message},500); }
});