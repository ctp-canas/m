import {useEffect,useState,type FormEvent} from 'react';
import {Image,RotateCcw,Upload,X} from 'lucide-react';
import type {State} from './domain';
import {artworkFiles,artworkLabels,artworkSlots,fileAsDataUrl,validateArtworkFile,type ArtworkSlot,type ArtworkMode} from './report-artwork';
import {connectReports,disconnectReports,downloadArtwork,getRemoteArtwork,reportingConfigured,updateRemoteArtwork,useReportSession,type RemoteArtworkChoice} from './lib/report-backend';

export function ReportConnection(){
  const session=useReportSession();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  if(!reportingConfigured)return null;
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget;
    const data=new FormData(form);
    setBusy(true);setError('');
    try{await connectReports(String(data.get('identification')).trim(),String(data.get('password')));form.reset()}
    catch(err){setError((err as Error).message)}
    finally{setBusy(false)}
  }
  if(session)return null;
  return <form className="report-session" onSubmit={submit}>
    <p>Ingrese con su cuenta autorizada para consultar los informes y las imágenes institucionales.</p>
    <div className="form-grid">
      <label className="field"><span>Cédula de usuario</span><input name="identification" autoComplete="username" required/></label>
      <label className="field"><span>Contraseña de usuario</span><input name="password" type="password" autoComplete="current-password" required/></label>
    </div>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    <button className="button primary" disabled={busy}>{busy?'Conectando…':'Ingresar a informes institucionales'}</button>
  </form>;
}

function ArtworkPreview({slot,choice,localUrl}:{slot:ArtworkSlot;choice?:RemoteArtworkChoice;localUrl?:string}){
  const session=useReportSession();
  const [download,setDownload]=useState<{path:string;url:string}|null>(null);
  const [failed,setFailed]=useState('');
  const path=choice?.object_path;
  useEffect(()=>{
    if(!session||!path)return;
    let active=true,url='';
    void downloadArtwork(session.client,path).then(blob=>{
      if(active){url=URL.createObjectURL(blob);setDownload({path,url})}
    }).catch(()=>{if(active)setFailed(path)});
    return ()=>{active=false;if(url)URL.revokeObjectURL(url)};
  },[session,path]);
  const src=path?(download?.path===path?download.url:''):localUrl||`${import.meta.env.BASE_URL}assets/${artworkFiles[slot]}`;
  if(path&&failed===path&&download?.path!==path)return <p role="alert">No se pudo cargar la vista previa.</p>;
  return src?<img src={src} alt={artworkLabels[slot]}/>:<p role="status">Cargando vista previa…</p>;
}

export function ReportConfiguration({db,saveLocal}:{db:State;saveLocal:(slot:ArtworkSlot,mode:ArtworkMode,dataUrl?:string)=>Promise<void>}){
  const session=useReportSession();
  const [remoteState,setRemote]=useState<{session:typeof session;choices:RemoteArtworkChoice[]}|null>(null);
  const remote=remoteState?.session===session?remoteState.choices:null;
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState<ArtworkSlot|null>(null);
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    if(!session?.artwork)return;
    let active=true;
    void getRemoteArtwork(session.client).then(items=>{if(active)setRemote({session,choices:items})})
      .catch(err=>{if(active)setError((err as Error).message)});
    return ()=>{active=false};
  },[session,reload]);
  const canEdit=!reportingConfigured||Boolean(session?.editArtwork&&remote);
  async function save(slot:ArtworkSlot,mode:ArtworkMode,file?:File){
    if(busy||!canEdit)return;
    setBusy(slot);setError('');setMessage('');
    try{
      const mime=file?await validateArtworkFile(file):undefined;
      if(session){
        const current=remote?.find(item=>item.slot===slot);
        if(!current)throw Error('La configuración todavía se está cargando.');
        await updateRemoteArtwork(session.client,current,mode,file,mime);
        setRemote({session,choices:await getRemoteArtwork(session.client)});
      }else{
        const url=file&&mime?await fileAsDataUrl(file,mime):undefined;
        await saveLocal(slot,mode,url);
      }
      setMessage('Imagen del informe actualizada.');
    }catch(err){setError((err as Error).message)}
    finally{setBusy(null)}
  }
  return <section className="card report-artwork-card">
    <div className="card-heading"><div><h3>Configuración de informes</h3><p>Administre el encabezado y el pie de todos los documentos impresos.</p></div><Image size={23}/></div>
    <div className="report-artwork-content">
      <ReportConnection/>
      {!reportingConfigured&&<p className="muted">Modo de pruebas. Las imágenes se guardan en este navegador.</p>}
      {session?.artwork&&!session.editArtwork&&<p className="muted">Puede consultar las imágenes. La edición requiere autorización de configuración.</p>}
      {error&&<p role="alert" className="error-banner">{error}</p>}
      {message&&<p role="status" className="success-banner">{message}</p>}
      {session?.artwork&&<button className="button secondary" onClick={()=>{setError('');setReload(value=>value+1)}}>Actualizar vista previa</button>}
      {(!reportingConfigured||session?.artwork)&&<div className="report-artwork-grid">
        {artworkSlots.map(slot=>{
          const institutional=remote?.find(item=>item.slot===slot);
          const local=db.reportArtwork?.[slot];
          const mode=(session?institutional?.mode:local?.mode)??'default';
          return <section key={slot} className="report-artwork-slot">
            <h4>{artworkLabels[slot]}</h4>
            <p className="muted">{mode==='custom'?'Imagen personalizada':mode==='hidden'?'Imagen oculta':'Imagen institucional original'}</p>
            <div className="report-artwork-frame">
              {session&&!remote?<p role="status">Cargando vista previa…</p>:mode==='hidden'?<span>Sin imagen</span>:<ArtworkPreview slot={slot} choice={session?institutional:undefined} localUrl={!session&&local?.mode==='custom'?local.dataUrl:undefined}/>}
            </div>
            {canEdit&&<div className="report-artwork-actions">
              <label className="field"><span><Upload size={15}/> Cargar o reemplazar imagen</span>
                <input aria-label={`Cargar ${artworkLabels[slot].toLowerCase()}`} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={!!busy}
                  onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void save(slot,'custom',file)}}/>
              </label>
              <div className="flex">
                <button className="button secondary" disabled={!!busy||mode==='hidden'} onClick={()=>void save(slot,'hidden')}><X size={15}/> Quitar imagen</button>
                <button className="button secondary" disabled={!!busy||mode==='default'} onClick={()=>void save(slot,'default')}><RotateCcw size={15}/> Restaurar original</button>
              </div>
            </div>}
          </section>;
        })}
      </div>}
    </div>
  </section>;
}
