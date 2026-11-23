import type {State} from './domain';
import {institutionalClient} from './lib/supabase';
import * as local from './store-local';

export async function loadState():Promise<State>{
  if(import.meta.env.MODE==='test')return local.loadState();
  const {data,error}=await institutionalClient().rpc('load_application');
  if(error||!data)throw Error(error?.message||'No se pudo consultar la matrícula institucional.');
  return data as State;
}
export async function persist(next:State,expectedRevision:number):Promise<State>{
  if(import.meta.env.MODE==='test')return local.persist(next,expectedRevision);
  const {data,error}=await institutionalClient().rpc('save_application',{next_state:next,expected_revision:expectedRevision});
  if(error||!data)throw Error(error?.message||'No se pudo guardar. Sus cambios siguen en el formulario.');
  return data as State;
}
export function initializeState(){return loadState()}
