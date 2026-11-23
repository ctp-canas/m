import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {cors} from '../_shared/cors.ts';

const staff=['students.read','students.write','configuration.read','medical.read','medical.write',
  'accommodations.read','accommodations.write','reports.read','reports.write','enrollments.confirm','audit.read'];
Deno.serve(async request=>{
  const {headers,allowed}=cors(request);
  const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{headers,status});
  if(!allowed)return new Response(null,{status:403});
  if(request.method==='OPTIONS')return new Response(null,{headers});
  if(request.method!=='POST')return response({error:'Método no permitido'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL')!;
    const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');
    if(!token)return response({error:'Acceso denegado'},401);
    const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    const {data:identity,error:identityError}=await admin.auth.getUser(token);
    if(identityError||!identity.user)return response({error:'Acceso denegado'},401);
    const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{
      global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false},
    });
    const {data:account,error}=await caller.rpc('current_account');
    if(error||!account?.active||account.mustChangePassword||!account.permissions.includes('*')){
      return response({error:'Solo el administrador puede gestionar usuarios'},403);
    }
    const body=await request.json();
    if(body.action==='list'){
      const {data,error}=await admin.rpc('list_accounts');
      return error?response({error:'No se pudo consultar usuarios'},500):response({users:data});
    }
    if(body.action==='toggle'){
      if(body.id===identity.user.id)return response({error:'Su cuenta debe permanecer activa'},400);
      const {data}=await admin.rpc('list_accounts');
      const target=data?.find((entry:{id:string})=>entry.id===body.id);
      if(!target)return response({error:'Usuario no disponible'},404);
      const {error}=await admin.rpc('manage_account',{target:target.id,identity_number:target.identification,
        email_address:target.email,account_name:target.name,rights:target.permissions,enabled:!target.active});
      return error?response({error:'No se pudo actualizar el usuario'},500):response({ok:true});
    }
    if(body.action!=='create'||typeof body.identification!=='string'||! /^[A-Za-z0-9-]{5,25}$/.test(body.identification)
      ||typeof body.name!=='string'||!body.name.trim()||typeof body.email!=='string'||!body.email.includes('@')
      ||typeof body.password!=='string'||body.password.length<12||body.password.length>128){
      return response({error:'Complete la cédula, nombre, correo y contraseña temporal de 12 caracteres o más'},400);
    }
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email:body.email.trim(),password:body.password,email_confirm:true,
    });
    if(createError||!created.user)return response({error:'No se pudo crear el usuario. Verifique si el correo ya está registrado.'},400);
    const {error:linkError}=await admin.rpc('provision_account',{
      target:created.user.id,identity_number:body.identification,email_address:body.email.trim(),
      account_name:body.name.trim(),rights:body.role==='Administrador'?['*']:staff,
    });
    if(linkError){
      await admin.auth.admin.deleteUser(created.user.id);
      return response({error:'No se pudo registrar la autorización. Verifique si la cédula ya existe.'},400);
    }
    return response({ok:true});
  }catch{return response({error:'No se pudo completar la gestión de usuarios'},500)}
});
