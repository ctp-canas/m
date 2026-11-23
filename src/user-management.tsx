import {useEffect,useState,type FormEvent} from 'react';
import {institutionalClient} from './lib/supabase';
import {currentInstitutionalAccount} from './institutional-access';
type User={id:string;identification:string;name:string;email:string;active:boolean;mustChangePassword:boolean;permissions:string[]};
export function UserManagement(){
  const [users,setUsers]=useState<User[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const admin=currentInstitutionalAccount?.permissions.includes('*');
  async function invoke(body:Record<string,unknown>){
    const {data,error}=await institutionalClient().functions.invoke('manage-user',{body});
    if(error||data?.error)throw Error(data?.error||'No se pudo completar la gestión de usuarios.');
    return data;
  }
  async function refresh(){
    try{const data=await invoke({action:'list'});setUsers(data.users)}
    catch(err){setError((err as Error).message)}
  }
  useEffect(()=>{if(admin)void refresh()},[admin]);
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setMessage('');
    const form=event.currentTarget;
    try{
      await invoke({action:'create',...Object.fromEntries(new FormData(form))});
      form.reset();await refresh();setMessage('Usuario creado. Deberá cambiar la contraseña temporal al ingresar.');
    }catch(err){setError((err as Error).message)}
    finally{setBusy(false)}
  }
  if(!admin)return <section className="card"><div className="modal-body"><h3>Usuarios y permisos</h3><p>La gestión de usuarios requiere una cuenta administradora.</p></div></section>;
  return <section className="card"><div className="card-heading"><div><h3>Usuarios autorizados</h3><p>El cambio de contraseña temporal es obligatorio en el primer ingreso.</p></div></div>
    <div className="modal-body">
      {error&&<p role="alert" className="error-banner">{error}</p>}
      {message&&<p role="status" className="success-banner">{message}</p>}
      <form onSubmit={create}><div className="form-grid">
        <label className="field"><span>Cédula</span><input name="identification" required pattern="[A-Za-z0-9-]{5,25}"/></label>
        <label className="field"><span>Nombre completo</span><input name="name" required/></label>
        <label className="field"><span>Correo de recuperación</span><input name="email" type="email" required/></label>
        <label className="field"><span>Contraseña temporal</span><input name="password" type="password" required minLength={12} autoComplete="new-password"/></label>
        <label className="field"><span>Rol</span><select name="role"><option>Personal de matrícula</option><option>Administrador</option></select></label>
      </div><button className="button primary" disabled={busy}>{busy?'Guardando…':'Crear usuario'}</button></form>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Cédula</th><th>Nombre</th><th>Rol</th><th>Acceso</th><th>Acción</th></tr></thead>
      <tbody>{users.map(user=><tr key={user.id}><td>{user.identification}</td><td>{user.name}</td><td>{user.permissions.includes('*')?'Administrador':'Personal de matrícula'}</td>
        <td>{user.active?'Habilitado':'Deshabilitado'}{user.mustChangePassword?' · Contraseña temporal':''}</td>
        <td><button className="button secondary" disabled={busy||user.identification===currentInstitutionalAccount?.identification}
          onClick={()=>{setBusy(true);setError('');void invoke({action:'toggle',id:user.id}).then(refresh).catch(err=>setError((err as Error).message)).finally(()=>setBusy(false))}}>
          {user.active?'Deshabilitar':'Habilitar'}</button></td></tr>)}</tbody></table></div>
  </section>;
}
