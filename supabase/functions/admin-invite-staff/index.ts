import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const cors={
  "Access-Control-Allow-Origin":"https://dmitriz832-bit.github.io",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply(405,{message:"Метод не поддерживается"});
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization=req.headers.get("Authorization")||"";
    const token=authorization.replace(/^Bearer\s+/i,"");
    if(!token)return reply(401,{message:"Требуется авторизация"});
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user)return reply(401,{message:"Сессия недействительна"});
    // Auth user lookup alone does not reject a signed JWT from a revoked session.
    // Run the session RPC under the caller JWT before any service-role data access.
    const caller=createClient(url,service,{global:{headers:{Authorization:"Bearer "+token}},auth:{autoRefreshToken:false,persistSession:false}});
    const {data:activeSession,error:sessionError}=await caller.rpc("has_active_finance_session");
    if(sessionError||activeSession!==true)return reply(401,{message:"Сессия завершена. Войдите снова."});
    const {data:actor}=await admin.from("staff_access").select("role,enabled,email").eq("user_id",user.id).maybeSingle();
    if(!actor?.enabled||actor.role!=="admin")return reply(403,{message:"Только администратор может выдавать доступ"});
    const payload=await req.json();
    const email=String(payload.email||"").trim().toLowerCase();
    const action=String(payload.action||"invite");
    const role=String(payload.role||"");
    const employee_id=String(payload.employee_id||"").trim();
    const full_name=String(payload.full_name||"").trim();
    if(action==="remove"){
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,{message:"Некорректная почта"});
      if(email===user.email?.toLowerCase())return reply(403,{message:"Нельзя удалить собственный доступ"});
      const {data:targetAllow}=await admin.from("allowed_emails").select("role").eq("email",email).maybeSingle();
      if(targetAllow?.role==="admin"){
        const {count}=await admin.from("allowed_emails").select("email",{count:"exact",head:true}).eq("role","admin").eq("enabled",true);
        if((count||0)<=1)return reply(403,{message:"Нельзя удалить последнего администратора"});
      }
      const {data:users,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
      if(listError)throw listError;
      const target=users.users.find(candidate=>candidate.email?.toLowerCase()===email);
      // Revoke access without deleting Auth users or immutable audit relationships.
      const {error:allowError}=await admin.from("allowed_emails").update({enabled:false,updated_at:new Date().toISOString()}).eq("email",email);
      if(allowError)throw allowError;
      const {error:accessError}=await admin.from("staff_access").update({enabled:false}).eq("email",email);
      if(accessError)throw accessError;
      if(target){
        // Ban authentication at GoTrue in addition to immediate RLS denial by staff_access.
        const {error:banError}=await admin.auth.admin.updateUserById(target.id,{ban_duration:"876000h"});
        if(banError)throw banError;
      }
      const {error:auditError}=await admin.from("staff_activity").insert({user_id:user.id,email:user.email,event:"access_revoked",details:{target:email,auth_user_preserved:true}});
      if(auditError)throw auditError;
      return reply(200,{ok:true,removed:true});
    }
    if(action!=="invite")return reply(400,{message:"Неизвестное действие"});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["admin","accountant","employee"].includes(role)||!employee_id||!full_name)return reply(400,{message:"Заполните сотрудника, корректную почту и роль"});
    const {data:allow,error:allowError}=await admin.from("allowed_emails").upsert({email,role,enabled:true,employee_id,full_name,updated_at:new Date().toISOString()},{onConflict:"email"}).select().single();
    if(allowError)throw allowError;
    const {data:list,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
    if(listError)throw listError;
    const existing=list.users.find(candidate=>candidate.email?.toLowerCase()===email);
    let invited=false;
    if(existing){
      const {error:updateError}=await admin.auth.admin.updateUserById(existing.id,{user_metadata:{...existing.user_metadata,full_name},ban_duration:"none"});
      if(updateError)throw updateError;
      await admin.from("staff_access").upsert({user_id:existing.id,email,employee_id,role,enabled:true},{onConflict:"user_id"});
    }else{
      const {error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name},redirectTo:"https://dmitriz832-bit.github.io/arbat-finance-test/app/"});
      if(inviteError)throw inviteError;
      invited=true;
    }
    await admin.from("staff_activity").insert({user_id:user.id,email:user.email,event:"access_created",details:{target:email,employee_id,full_name,role,invited}});
    return reply(200,{ok:true,invited,staff:allow});
  }catch(error){
    console.error(error);
    return reply(500,{message:error instanceof Error?error.message:"Не удалось создать доступ"});
  }
});