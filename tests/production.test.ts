import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {blankEnrollment,blankStudent,type State} from '../src/domain';
let pg:PGlite;
const admin='00000000-0000-4000-8000-000000000051';
const outsider='00000000-0000-4000-8000-000000000052';
async function acting(id:string,query:string,params:unknown[]=[]){
  await pg.exec(`set role authenticated;set request.jwt.claim.sub='${id}'`);
  try{return await pg.query<{state:State}>(query,params)}finally{await pg.exec('reset role')}
}
async function load(){return(await acting(admin,'select public.load_application() as state')).rows[0].state}
async function save(state:State,revision=state.revision){
  return(await acting(admin,'select public.save_application($1::jsonb,$2::integer) as state',[JSON.stringify(state),revision])).rows[0].state;
}
beforeAll(async()=>{
  pg=new PGlite();
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update on storage.objects to authenticated;`);
  for(const file of readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort()){
    await pg.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  }
  await pg.exec(`insert into auth.users(id) values('${admin}'),('${outsider}');
    insert into private.accounts(user_id,identification,auth_email,display_name,must_change_password,permissions)
    values('${admin}','PRODADMIN','admin@example.invalid','Administrador de pruebas',false,array['*']);`);
},30000);
afterAll(async()=>{await pg?.close()});

it('inicia sin estudiantes ni especialidades y conserva los grupos con cupo 17',async()=>{
  const state=await load();
  expect(state.students).toEqual([]);
  expect(state.enrollments).toEqual([]);
  expect(state.settings.specialties).toEqual([]);
  expect(state.years).toEqual([]);
  expect(state.groups).toEqual([]);
  expect(state.groups.every(g=>g.capacity===17)).toBe(true);
});
it('impide consultas de usuarios sin autorización',async()=>{
  await expect(acting(outsider,'select public.load_application()')).rejects.toThrow(/Acceso denegado/);
  expect((await acting(outsider,'select * from public.application_control')).rows).toEqual([]);
});
it('guarda configuración, rechaza versiones antiguas y no permite borrar expedientes',async()=>{
  const state=await load();
  state.settings.specialties=['Especialidad creada por usuario'];
  state.years.push({year:2027,status:'Abierto'});
  state.groups.push(...['A','B'].map(subgroup=>({id:crypto.randomUUID(),year:2027,grade:8,section:'1',subgroup,specialty:'',capacity:17})));
  const saved=await save(state);
  expect(saved.settings.specialties).toEqual(state.settings.specialties);
  await expect(save(state)).rejects.toThrow(/otra computadora/);
});
it('bloquea el alumno 18 del subgrupo y permite 34 entre A y B',async()=>{
  let state=await load();
  const groupA=state.groups.find(g=>g.grade===8&&g.section==='1'&&g.subgroup==='A')!;
  function add(group:typeof groupA,n:number){
    const student={...blankStudent(),identification:`QAPROD${n}`,name:'Persona',surname1:'Ficticia'};
    const e={...blankEnrollment(student.id,2027,[]),grade:group.grade,section:group.section,subgroup:group.subgroup,status:'Activo' as const};
    state.students.push(student);state.enrollments.push(e);
  }
  for(let n=0;n<17;n++)add(groupA,n);
  state=await save(state);
  add(groupA,17);
  await expect(save(state)).rejects.toThrow(/subgrupo.*17/);
  state=await load();
  const groupB=state.groups.find(g=>g.grade===8&&g.section==='1'&&g.subgroup==='B')!;
  for(let n=17;n<34;n++)add(groupB,n);
  state=await save(state);
  expect(state.enrollments.filter(e=>e.grade===8&&e.section==='1')).toHaveLength(34);
  state.groups.push({...groupA,id:crypto.randomUUID(),subgroup:'C'});
  add(state.groups.at(-1)!,34);
  await expect(save(state)).rejects.toThrow(/sección.*34/);
  state=await load();
  expect(state.students).toHaveLength(34);
  const revision=state.revision;
  state.students.pop();
  await expect(save(state)).rejects.toThrow(/eliminar expedientes/);
  expect((await load()).revision).toBe(revision);
});

it('un operador puede guardar expedientes sin cambiar configuración institucional',async()=>{
  const staff='00000000-0000-4000-8000-000000000053';
  await pg.exec(`insert into auth.users(id) values('${staff}');
    insert into private.accounts(user_id,identification,auth_email,display_name,must_change_password,permissions)
    values('${staff}','PRODSTAFF','staff@example.invalid','Personal de matrícula',false,
    array['students.read','students.write','medical.read','medical.write','configuration.read','reports.read','audit.read']);`);
  const state=(await acting(staff,'select public.load_application() as state')).rows[0].state;
  const editedId=state.students[0].id;
  state.students[0].address='Nueva dirección ficticia';
  const {rows}=await acting(staff,'select public.save_application($1::jsonb,$2::integer) as state',[JSON.stringify(state),state.revision]);
  expect(rows[0].state.students.find(student=>student.id===editedId)?.address).toBe('Nueva dirección ficticia');
  const changed=rows[0].state;
  changed.settings.phone='88881111';
  await expect(acting(staff,'select public.save_application($1::jsonb,$2::integer) as state',[JSON.stringify(changed),changed.revision])).rejects.toThrow(/permiso.*configuración/);
});

it('limita a 17 una especialidad aunque se reparta en subgrupos de la misma sección',async()=>{
  let state=await load();
  const specialty=state.settings.specialties[0];
  const a={id:crypto.randomUUID(),year:2027,grade:10,section:'1',subgroup:'A',specialty,capacity:17};
  const b={...a,id:crypto.randomUUID(),subgroup:'B'};
  state.groups.push(a,b);
  for(let n=0;n<17;n++){
    const st={...blankStudent(),identification:`QASPECIAL${n}`,name:'Persona',surname1:'Ficticia'};
    state.students.push(st);
    state.enrollments.push({...blankEnrollment(st.id,2027,[]),grade:10,section:'1',subgroup:n<9?'A':'B',specialty,status:'Activo'});
  }
  state=await save(state);
  const st={...blankStudent(),identification:'QASPECIAL18',name:'Persona',surname1:'Ficticia'};
  state.students.push(st);
  state.enrollments.push({...blankEnrollment(st.id,2027,[]),grade:10,section:'1',subgroup:'B',specialty,status:'Activo'});
  await expect(save(state)).rejects.toThrow(/especialidad.*17/);
});
