import {createContext,useContext,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {configured,institutionalClient,institutionalSessionStorage,signInByIdentification} from './lib/supabase';
import {finishSessionLogout} from './lib/session-logout';
import {adoptReportClient,clearReportSession} from './lib/report-backend';

type Account={identification:string;name:string;active:boolean;mustChangePassword:boolean;permissions:string[]};
export let currentInstitutionalAccount:Account|null=null;
const LogoutContext=createContext<null|(()=>Promise<void>)>(null);
export function InstitutionalLogoutButton({className,children='Cerrar sesión'}:{className?:string;children?:ReactNode}){
  const close=useContext(LogoutContext);
  return <button type="button" className={className} disabled={!close} onClick={()=>{void close?.()}}>{children}</button>;
}

export function InstitutionalAccess({children}:{children:ReactNode}){
  const [session,setSession]=useState<Session|null>(null);
  const [account,setAccount]=useState<Account|null>(null);
  const [starting,setStarting]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [activation,setActivation]=useState(false);
  const [sentTo,setSentTo]=useState('');
  const [revision,setRevision]=useState(0);
  const [resetting,setResetting]=useState(()=>/type=(recovery|magiclink)/.test(location.hash));
  const closingRef=useRef(false);
  const [closing,setClosing]=useState(false);
  function clearAccess(){
    setSession(null);setAccount(null);currentInstitutionalAccount=null;
    setResetting(false);setActivation(false);setSentTo('');setMessage('');setError('');
    clearReportSession();
  }
  async function closeSession(){
    if(closingRef.current)return;
    closingRef.current=true;setClosing(true);clearAccess();
    await finishSessionLogout(institutionalClient().auth,
      ()=>institutionalSessionStorage.forget(),
      ()=>window.location.replace(window.location.origin+window.location.pathname));
  }
  useEffect(()=>{
    if(!configured){setStarting(false);return}
    const client=institutionalClient();
    let active=true;
    void client.auth.getSession().then(({data})=>{if(active&&!closingRef.current){setSession(data.session);setStarting(false)}});
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{
      if(active&&!closingRef.current){if(next)setSession(next);else clearAccess()}
    });
    return ()=>{active=false;subscription.unsubscribe()};
  },[]);
  useEffect(()=>{
    if(!session)return;
    let active=true;
    setError('');
    void (async()=>{
      const client=institutionalClient();
      const {data,error}=await client.rpc('current_account');
      if(error||!data?.active)throw Error('Esta cuenta todavía no está autorizada. Consulte al administrador.');
      if(!data.mustChangePassword)await adoptReportClient(client,()=>active&&!closingRef.current);
      if(active&&!closingRef.current){setAccount(data);currentInstitutionalAccount=data}
    })().catch(err=>{if(active)setError((err as Error).message)});
    return ()=>{active=false};
  },[session?.user.id,revision]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setMessage('');
    const form=event.currentTarget;
    const data=new FormData(form);
    try{
      if(account?.mustChangePassword||resetting){
        if(data.get('password')!==data.get('repeat'))throw Error('Las contraseñas no coinciden.');
        const {error}=await institutionalClient().functions.invoke('change-password',{body:{password:String(data.get('password'))}});
        if(error)throw Error('No se pudo actualizar la contraseña. Utilice al menos 12 caracteres.');
        setResetting(false);setRevision(value=>value+1);
      }else if(activation&&sentTo){
        const value=String(data.get('verification')).trim();
        let tokenHash:string|null=null;
        if(/^https:\/\//.test(value)){
          const url=new URL(value);
          if(url.origin!==new URL(import.meta.env.VITE_SUPABASE_URL).origin)throw Error('Pegue el enlace recibido de Supabase.');
          tokenHash=url.searchParams.get('token_hash')||url.searchParams.get('token');
          if(!tokenHash)throw Error('El enlace no contiene un código verificable.');
        }
        setResetting(true);
        const {error}=tokenHash
          ?await institutionalClient().auth.verifyOtp({token_hash:tokenHash,type:'email'})
          :await institutionalClient().auth.verifyOtp({email:sentTo,token:value,type:'email'});
        if(error){setResetting(false);throw Error('El código o enlace ya venció o no es válido. Solicite otro.')}
      }else if(activation){
        const {error}=await institutionalClient().auth.signInWithOtp({
          email:String(data.get('email')).trim(),
          options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname},
        });
        if(error)throw Error('No se pudo enviar el enlace. Inténtelo nuevamente dentro de unos minutos.');
        setSentTo(String(data.get('email')).trim());setMessage('Revise su correo. Copie el enlace de acceso del mensaje y péguelo aquí, o ingrese el código de verificación si aparece.');
      }else{
        await signInByIdentification(String(data.get('identification')).trim(),String(data.get('password')));
      }
    }catch(err){setError((err as Error).message)}
    finally{setBusy(false)}
  }
  if(closing)return <main className="login-page"><section className="card login-card"><p role="status">Cerrando sesión…</p></section></main>;
  if(session&&account&&!account.mustChangePassword&&!resetting)return <LogoutContext.Provider value={closeSession}><div key={session.user.id}>{children}</div></LogoutContext.Provider>;
  return <main className="login-page"><section className="card login-card">
    <img src={`${import.meta.env.BASE_URL}assets/escudo.jpeg`} alt="Escudo CTP Cañas" width="90"/>
    <p className="eyebrow">COLEGIO TÉCNICO PROFESIONAL DE CAÑAS</p>
    <h1>{account?.mustChangePassword?'Establezca su contraseña':'Gestión de matrícula'}</h1>
    <p>{account?.mustChangePassword?'Utilice una contraseña personal de al menos 12 caracteres.':'Ingrese con su cédula y contraseña institucional.'}</p>
    {!configured?<p role="alert">La conexión institucional está pendiente de configuración.</p>:starting?<p role="status">Verificando su sesión…</p>:
      session&&!account?<p role="status">{error||'Consultando sus permisos…'}</p>:
      <form onSubmit={submit}>
        {activation&&!account?(sentTo?<label className="field"><span>Código o enlace recibido por correo</span><input name="verification" type="text" required autoComplete="one-time-code"/></label>:<label className="field"><span>Correo autorizado</span><input name="email" type="email" required autoComplete="email"/></label>):!account&&
          <label className="field"><span>Cédula de usuario</span><input name="identification" required autoComplete="username"/></label>}
        {(!activation||account)&&<label className="field"><span>{account?'Nueva contraseña':'Contraseña'}</span><input name="password" type="password" required minLength={account?12:undefined} autoComplete={account?'new-password':'current-password'}/></label>}
        {account&&<label className="field"><span>Confirme la contraseña</span><input name="repeat" type="password" required minLength={12} autoComplete="new-password"/></label>}
        <button className="button primary" disabled={busy}>{busy?'Procesando…':account?'Guardar contraseña':activation?sentTo?'Verificar acceso':'Enviar enlace de acceso':'Ingresar'}</button>
      </form>}
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {message&&<p role="status" className="success-banner">{message}</p>}
    {!session&&configured&&<button className="text-button" onClick={()=>{setActivation(value=>!value);setSentTo('');setError('');setMessage('')}}>{activation?'Ingresar con cédula':'Activar cuenta o recuperar acceso'}</button>}
    {session&&<button type="button" className="button secondary" onClick={()=>{void closeSession()}}>Cerrar sesión</button>}
  </section></main>;
}
