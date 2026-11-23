import {createClient,type SupabaseClient} from '@supabase/supabase-js';

export const configured=Boolean(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
let client:SupabaseClient|undefined;
export function institutionalClient(){
  if(!configured)throw Error('La conexión con Supabase todavía no está configurada.');
  return client??=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
  });
}
export async function signInByIdentification(identification:string,password:string){
  const client=institutionalClient();
  const {data,error}=await client.functions.invoke('login-by-id',{body:{identification,password}});
  if(error||!data?.session)throw Error('No se pudo iniciar sesión. Verifique su cédula y contraseña.');
  const {error:sessionError}=await client.auth.setSession(data.session);
  if(sessionError)throw Error('No se pudo establecer la sesión.');
  return client;
}
export async function listInstitutionalStudents(client:ReturnType<typeof institutionalClient>,year:number){
  const {data,error}=await client.from('enrollments').select('*,students(*),academic_groups(*)').eq('year',year);
  if(error)throw error;
  return data;
}
export async function confirmInstitutionalEnrollments(client:ReturnType<typeof institutionalClient>,ids:string[]){
  const {data,error}=await client.rpc('confirm_enrollments',{enrollment_ids:ids});
  if(error)throw error;
  return data;
}
export async function registerInstitutionalStudent(client:ReturnType<typeof institutionalClient>,student:import('../domain').Student,enrollment:import('../domain').Enrollment){
  const {data,error}=await client.rpc('register_manual_enrollment',{student,enrollment});
  if(error)throw error;
  return data as string;
}
