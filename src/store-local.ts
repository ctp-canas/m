import {seed} from './seed';
import type {State} from './domain';
import {ensureTransferHistory} from './transfer-events';
const DB='ctp-canas-matricula-pruebas-v1';
async function open(){return await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function loadState():Promise<State>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly');const r=tx.objectStore('state').get('main');r.onsuccess=()=>{const state:State=r.result||seed();ensureTransferHistory(state);resolve(state)};r.onerror=()=>reject(r.error)})}finally{db.close()}}
export async function persist(next:State,expectedRevision:number):Promise<State>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');const r=store.get('main');r.onsuccess=()=>{if(r.result&&r.result.revision!==expectedRevision){tx.abort();return;}next.revision=expectedRevision+1;store.put(next,'main')};tx.oncomplete=()=>resolve(next);tx.onabort=()=>reject(Error('Los datos cambiaron en otra ventana. Recargue la página y vuelva a intentar.'));tx.onerror=()=>reject(tx.error)})}finally{db.close()}}

let initialization:Promise<State>|null=null;
export function initializeState(){return initialization ||= loadState().then(s=>s.revision?s:persist(s,0))}
