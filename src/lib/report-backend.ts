import {useSyncExternalStore} from 'react';
import {signInByIdentification,type institutionalClient} from './supabase';
import type {ArtworkMode,ArtworkSlot} from '../report-artwork';
import type {TransferEvent,TransferFilters} from '../transfer-events';

type Client=ReturnType<typeof institutionalClient>;
export type RemoteArtworkChoice={slot:ArtworkSlot;mode:ArtworkMode;object_path:string|null;revision:number};
type ReportSession={client:Client;artwork:boolean;editArtwork:boolean;transfers:boolean};

export const reportingConfigured=Boolean(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
let session:ReportSession|null=null;
let unsubscribeAuth:(()=>void)|undefined;
const listeners=new Set<()=>void>();
const setSession=(next:ReportSession|null)=>{
  session=next;
  listeners.forEach(listener=>listener());
};
export const getReportSession=()=>session;
const subscribe=(listener:()=>void)=>{
  listeners.add(listener);
  return ()=>{listeners.delete(listener)};
};
export const useReportSession=()=>useSyncExternalStore(subscribe,getReportSession);

export async function connectReports(identification:string,password:string){
  const client=await signInByIdentification(identification,password);
  await adoptReportClient(client);
}
export async function adoptReportClient(client:Client,isCurrent=()=>true){
  const {data,error}=await client.rpc('report_permissions');
  if(!isCurrent())return;
  if(error||!(data?.artwork||data?.transfers)){
    await client.auth.signOut({scope:'local'});
    throw Error('La cuenta no tiene acceso a informes o la configuración institucional no está lista. Verifique sus permisos y el cambio de contraseña temporal.');
  }
  unsubscribeAuth?.();
  setSession({client,artwork:!!data.artwork,editArtwork:!!data.editArtwork,transfers:!!data.transfers});
  const {data:{subscription}}=client.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT'&&session?.client===client){
      setSession(null);
      unsubscribeAuth?.();
      unsubscribeAuth=undefined;
    }
  });
  unsubscribeAuth=()=>subscription.unsubscribe();
}

export function clearReportSession(){
  setSession(null);
  unsubscribeAuth?.();
  unsubscribeAuth=undefined;
}
export async function disconnectReports(){
  const previous=session;
  clearReportSession();
  if(previous)await previous.client.auth.signOut({scope:'local'});
}

export async function getRemoteArtwork(client:Client){
  const {data,error}=await client.from('report_artwork').select('slot,mode,object_path,revision');
  if(error||data?.length!==2)throw Error('No se pudo consultar la configuración institucional de informes.');
  return data as RemoteArtworkChoice[];
}
export async function downloadArtwork(client:Client,path:string){
  const {data,error}=await client.storage.from('report-artwork').download(path);
  if(error||!data)throw Error('No se pudo recuperar la imagen institucional seleccionada.');
  return data;
}
export async function updateRemoteArtwork(client:Client,current:RemoteArtworkChoice,mode:ArtworkMode,file?:File,mime?:string){
  let path:string|null=null;
  if(mode==='custom'){
    if(!file||!mime)throw Error('Seleccione una imagen.');
    path=`${current.slot}/${crypto.randomUUID()}.${mime==='image/png'?'png':'jpg'}`;
    const {error}=await client.storage.from('report-artwork').upload(path,file,{contentType:mime,upsert:false,cacheControl:'3600'});
    if(error)throw Error('No se pudo cargar la imagen institucional. Verifique sus permisos.');
  }
  const {data,error}=await client.from('report_artwork').update({mode,object_path:path})
    .eq('slot',current.slot).eq('revision',current.revision).select('slot').maybeSingle();
  if(error||!data)throw Error('No se guardó el cambio. Recargue la configuración y verifique los permisos.');
}

export async function remoteTransfers(client:Client,filters:TransferFilters){
  const result:TransferEvent[]=[];
  const size=500;
  for(let offset=0;;offset+=size){
    let query=client.from('report_transfers').select('id,enrollment_id,year,transfer_date,transfer_grade,transfer_section,transfer_name,transfer_identification')
      .eq('year',filters.year).order('transfer_date').order('id').range(offset,offset+size-1);
    if(filters.start)query=query.gte('transfer_date',filters.start);
    if(filters.end)query=query.lte('transfer_date',filters.end);
    if(filters.grade)query=query.eq('transfer_grade',Number(filters.grade));
    if(filters.section)query=query.eq('transfer_section',Number(filters.section));
    const {data,error}=await query;
    if(error||!data)throw Error('No se pudo consultar el historial institucional de traslados.');
    for(const row of data)result.push({
      id:row.id,enrollmentId:row.enrollment_id,year:row.year,date:row.transfer_date,
      grade:row.transfer_grade,section:String(row.transfer_section??''),
      name:row.transfer_name||'No registrado',identification:row.transfer_identification||'No registrada',
    });
    if(data.length<size)return result;
  }
}
