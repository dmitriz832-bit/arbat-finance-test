import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const APP_URL="https://dmitriz832-bit.github.io/arbat-finance-test/app/";
const ORIGIN="https://dmitriz832-bit.github.io";
const headers={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return reply(405,{message:"Метод не поддерживается"});
  try{
    const payload=await req.json();
    const email=String(payload.email||"").trim().toLowerCase();
    const action=String(payload.action||"status");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,{message:"Укажите корректную электронную почту"});
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
    const ip=(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||"unknown";
    const hash=async(input:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(input)))).map(b=>b.toString(16).padStart(2,"0")).join("");
    const check=async(scope:string,key:string,max:number,windowSeconds:number)=>{
      const {data,error}=await admin.rpc("consume_auth_request_limit",{p_scope:scope,p_identity_hash:await hash(key),p_max_attempts:max,p_window_seconds:windowSeconds});
      if(error)throw error;
      return data===true;
    };
    const recovery=action==="recover",sending=action==="send";
    const rateScope=recovery?"recovery":sending?"first-login":"status";
    if(!await check(rateScope+"-ip",ip,recovery?8:sending?8:40,3600))return reply(429,{message:"Слишком много запросов. Повторите позже."});
    if((sending||recovery)&&!await check(rateScope+"-email",email,3,3600))return reply(429,{message:"Слишком много запросов. Повторите позже."});
    const neutral={mode:"login",sent:true,message:"Если для этой почты доступ разрешён, письмо будет отправлено."};
    if(action==="status")return reply(200,{mode:"login"});
    if(!sending&&!recovery)return reply(400,{message:"Неизвестное действие"});
    const {data:allowed,error:allowedError}=await admin.from("allowed_emails").select("email,enabled,full_name").eq("email",email).maybeSingle();
    if(allowedError)throw allowedError;
    if(!allowed?.enabled)return reply(200,neutral);
    const {data:list,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
    if(listError)throw listError;
    const user=list.users.find(candidate=>candidate.email?.toLowerCase()===email);
    const firstLogin=!user||!user.last_sign_in_at;
    
    
    if(!firstLogin&&!recovery)return reply(200,neutral);
    if(recovery){
      const {error}=await admin.auth.resetPasswordForEmail(email,{redirectTo:APP_URL});
      if(error)console.error("Recovery failed",error);
    }else if(!user){
      const {error}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name:allowed.full_name||""},redirectTo:APP_URL});
      if(error)throw error;
    }else{
      const {error}=await admin.auth.resetPasswordForEmail(email,{redirectTo:APP_URL});
      if(error)throw error;
    }
    return reply(200,neutral);
  }catch(error){
    console.error(error);
    return reply(500,{message:"Не удалось обработать запрос. Повторите позднее."});
  }
});
