import {afterEach,expect,it,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {authStorageKey,createSessionStorage,finishSessionLogout} from '../src/lib/session-logout';

const url='https://matricula-test.supabase.co';
const key=authStorageKey(url);
function setup(){
  const values=new Map<string,string>();
  const backing={getItem:(name:string)=>values.get(name)??null,setItem:(name:string,value:string)=>{values.set(name,value)},removeItem:(name:string)=>{values.delete(name)}};
  const storage=createSessionStorage(key,()=>backing);
  return {storage,values};
}
afterEach(()=>vi.useRealTimers());

it('limpia solo el acceso institucional y conserva el almacenamiento de otros sistemas',async()=>{
  const {storage,values}=setup();
  [key,`${key}-code-verifier`,`${key}-user`].forEach(name=>storage.setItem(name,'sesión de prueba'));
  values.set('otra-aplicacion','conservar');
  const signOut=vi.fn().mockResolvedValue({error:null});
  const returnToLogin=vi.fn(()=>expect(values.has(key)).toBe(false));
  await finishSessionLogout({signOut},()=>storage.forget(),returnToLogin);
  expect(signOut).toHaveBeenCalledWith({scope:'local'});
  expect(returnToLogin).toHaveBeenCalledOnce();
  expect([...values]).toEqual([['otra-aplicacion','conservar']]);
});

it('no restaura credenciales por una renovación tardía después de salir',()=>{
  const {storage,values}=setup();
  storage.setItem(key,'sesión previa');
  storage.forget();
  storage.setItem(key,'renovación que llegó tarde');
  expect(storage.getItem(key)).toBeNull();
  expect(values.has(key)).toBe(false);
});

it('vuelve al ingreso si el cliente rechaza la solicitud por un error de red',async()=>{
  const {storage}=setup();storage.setItem(key,'sesión previa');
  const returnToLogin=vi.fn();
  await finishSessionLogout({signOut:()=>Promise.reject(new Error('Sin conexión'))},()=>storage.forget(),returnToLogin);
  expect(storage.getItem(key)).toBeNull();
  expect(returnToLogin).toHaveBeenCalledOnce();
});

it('termina el cierre si Supabase queda esperando y no vuelve a guardar una respuesta tardía',async()=>{
  vi.useFakeTimers();
  const {storage}=setup();storage.setItem(key,'sesión previa');
  let complete!:()=>void;
  const signOut=()=>new Promise<void>(resolve=>{complete=resolve});
  const returnToLogin=vi.fn();
  const finished=finishSessionLogout({signOut},()=>storage.forget(),returnToLogin);
  await vi.advanceTimersByTimeAsync(3999);
  expect(returnToLogin).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);await finished;
  expect(storage.getItem(key)).toBeNull();
  expect(returnToLogin).toHaveBeenCalledOnce();
  storage.setItem(key,'respuesta tardía');complete();
  expect(storage.getItem(key)).toBeNull();
});

it('elimina la sesión de memoria cuando el navegador bloquea el almacenamiento',async()=>{
  const storage=createSessionStorage(key,()=>{throw Error('Almacenamiento bloqueado')});
  storage.setItem(key,'sesión de memoria');
  expect(storage.getItem(key)).toBe('sesión de memoria');
  await finishSessionLogout({signOut:async()=>({error:null})},()=>storage.forget(),()=>{});
  expect(storage.getItem(key)).toBeNull();
});

it('respeta el cierre desde otra pestaña sin reutilizar una copia local antigua',()=>{
  const {storage,values}=setup();
  storage.setItem(key,'sesión previa');values.delete(key);
  expect(storage.getItem(key)).toBeNull();
});

it('reproduce el error HTTP 500 con el SDK real y limpia las credenciales pese al fallo remoto',async()=>{
  const {storage,values}=setup();
  const now=Math.floor(Date.now()/1000);
  const payload=btoa(JSON.stringify({sub:'00000000-0000-4000-8000-000000000099',exp:now+3600,iat:now,aud:'authenticated',role:'authenticated'}));
  const accessToken=`${btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${payload}.cHJ1ZWJh`;
  storage.setItem(key,JSON.stringify({access_token:accessToken,refresh_token:'refresh-de-prueba',expires_at:now+3600,expires_in:3600,token_type:'bearer',user:{id:'00000000-0000-4000-8000-000000000099',aud:'authenticated'}}));
  const request=vi.fn(async()=>new Response(JSON.stringify({message:'Error temporal'}),{status:500,headers:{'Content-Type':'application/json'}}));
  const client=createClient(url,'clave-publica-de-prueba',{auth:{storage,storageKey:key,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:request}});
  await client.auth.getSession();
  const result=await client.auth.signOut({scope:'local'});
  expect(result.error).not.toBeNull();
  expect(values.has(key)).toBe(true); // The original handler left this session behind.
  const returnToLogin=vi.fn();
  await finishSessionLogout(client.auth,()=>storage.forget(),returnToLogin);
  expect(request.mock.calls.length).toBeGreaterThan(0);
  expect(values.has(key)).toBe(false);
  expect(returnToLogin).toHaveBeenCalledOnce();
});
