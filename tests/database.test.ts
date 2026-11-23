import {PGlite} from '@electric-sql/pglite';import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {readFileSync} from 'node:fs';
import {blankEnrollment,blankStudent,type Row} from '../src/domain';
import {genderBySection} from '../src/gender-statistics';
import {seventhGradeRows} from '../src/origin-report';
import {reportValue} from '../src/reports';
let pg:PGlite;const ADMIN='00000000-0000-4000-8000-000000000001',READER='00000000-0000-4000-8000-000000000002',UNAUTHORIZED='00000000-0000-4000-8000-000000000003',TEMP='00000000-0000-4000-8000-000000000004';
async function role(id:string,sql:string){await pg.exec(`set role authenticated;set request.jwt.claim.sub='${id}'`);try{return await pg.query(sql)}finally{await pg.exec('reset role')}}
beforeAll(async()=>{pg=new PGlite();await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);await pg.exec(readFileSync('supabase/migrations/20261104212109_enrollment_foundation.sql','utf8'));await pg.exec(`insert into auth.users values('${ADMIN}'),('${READER}'),('${UNAUTHORIZED}'),('${TEMP}');insert into private.accounts(user_id,identification,auth_email,display_name,must_change_password,permissions) values('${ADMIN}','ADMIN00001','admin@test.invalid','Admin',false,array['*']),('${READER}','READER0001','reader@test.invalid','Reader',false,array['students.read']),('${UNAUTHORIZED}','NOACCESS01','no@test.invalid','No access',false,'{}'),('${TEMP}','TEMP000001','temp@test.invalid','Temp',true,array['*']);insert into public.academic_years values(2027,'Abierto'),(2026,'Cerrado');insert into public.students(id,identification,id_type,name,surname1,birthdate) values('10000000-0000-4000-8000-000000000001','DEMO00001','Prueba','Persona','Ficticia','2010-01-01');insert into public.enrollments(id,student_id,year) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',2027);insert into public.medical_records(enrollment_id) values('20000000-0000-4000-8000-000000000001');`);},30000);
afterAll(async()=>{await pg.close()});
describe('PostgreSQL y permisos (motor local, no servicios Supabase)',()=>{it('activa RLS en todas las tablas públicas',async()=>{const q=await pg.query<{relname:string}>('select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=\'public\' and c.relkind=\'r\' and not c.relrowsecurity');expect(q.rows).toEqual([])});it('un usuario autenticado sin permiso no ve estudiantes',async()=>expect((await role(UNAUTHORIZED,'select * from public.students')).rows).toHaveLength(0));it('un lector autorizado ve expedientes',async()=>expect((await role(READER,'select * from public.students')).rows).toHaveLength(1));it('un lector no puede insertar estudiantes',async()=>await expect(role(READER,"insert into public.students(identification,id_type,name,surname1) values('DEMO00002','Prueba','Nombre','Ficticio')")).rejects.toThrow());it('el lector no puede ver información médica',async()=>expect((await role(READER,'select * from public.medical_records')).rows).toHaveLength(0));it('administrador explícitamente autorizado sí ve información médica',async()=>expect((await role(ADMIN,'select * from public.medical_records')).rows).toHaveLength(1));it('una cuenta con contraseña temporal no puede leer expedientes',async()=>expect((await role(TEMP,'select * from public.students')).rows).toHaveLength(0));it('los datos de autorización no son editables por el cliente',async()=>await expect(role(READER,'select * from private.accounts')).rejects.toThrow());it('una cuenta desactivada pierde acceso inmediatamente',async()=>{await pg.exec(`update private.accounts set active=false where user_id='${READER}'`);expect((await role(READER,'select * from public.students')).rows).toHaveLength(0);await pg.exec(`update private.accounts set active=true where user_id='${READER}'`)});it('no expone la correspondencia identificación-email al cliente',async()=>await expect(role(READER,"select * from public.login_gate('ADMIN00001')")).rejects.toThrow());it('no permite omitir cambio de contraseña desde un cliente',async()=>await expect(role(TEMP,`select public.account_password_changed('${TEMP}')`)).rejects.toThrow());it('no permite duplicar la identidad sin distinguir mayúsculas',async()=>await expect(pg.exec("insert into public.students(identification,id_type,name,surname1) values('demo00001','Prueba','Nombre','Ficticio')")).rejects.toThrow());it('no permite dos matrículas del mismo estudiante y curso',async()=>await expect(pg.exec("insert into public.enrollments(student_id,year) values('10000000-0000-4000-8000-000000000001',2027)")).rejects.toThrow());it('rechaza crear matrícula activa directamente',async()=>await expect(role(ADMIN,"insert into public.enrollments(student_id,year,status) values('10000000-0000-4000-8000-000000000001',2027,'Activo')")).rejects.toThrow(/inactiva/));it('el cierre del curso impide nuevas matrículas',async()=>await expect(pg.exec("insert into public.enrollments(student_id,year) values('10000000-0000-4000-8000-000000000001',2026)")).rejects.toThrow(/no está abierto/));it('la confirmación rechaza expedientes incompletos',async()=>await expect(role(ADMIN,"select * from public.confirm_enrollments(array['20000000-0000-4000-8000-000000000001']::uuid[])")).rejects.toThrow(/grupo/));it('los eventos se generan en la base de datos',async()=>{const r=await pg.query('select * from public.enrollment_events');expect(r.rows.length).toBeGreaterThan(0)});it('el cliente no puede editar el registro de auditoría',async()=>await expect(role(ADMIN,"update public.audit_log set action='ALTERADO'")).rejects.toThrow());it('limita intentos consecutivos de acceso',async()=>{await pg.exec('set role service_role');try{for(let i=0;i<5;i++)await pg.query("select * from public.login_gate('ADMIN00001')");const r=await pg.query<{allowed:boolean}>("select * from public.login_gate('ADMIN00001')");expect(r.rows[0].allowed).toBe(false)}finally{await pg.exec('reset role')}})});
describe('Confirmación transaccional local y almacenamiento privado',()=>{it('confirma una matrícula completa mediante RPC',async()=>{await pg.exec(`insert into public.academic_groups(id,year,grade,section,subgroup,capacity) values('30000000-0000-4000-8000-000000000001',2027,7,1,'A',1);insert into public.addresses values('10000000-0000-4000-8000-000000000001','Guanacaste','Cañas','Cañas','Dirección ficticia');insert into public.guardians(student_id,name,phone,is_primary) values('10000000-0000-4000-8000-000000000001','Encargado ficticio','88880000',true);insert into public.accommodations(enrollment_id,verified_at) values('20000000-0000-4000-8000-000000000001',now());update public.medical_records set information_state='No posee',verified_at=now();insert into public.enrollment_verifications(enrollment_id,category,verified) select '20000000-0000-4000-8000-000000000001',k,true from unnest(array['identity','personal','academic','address','guardians','departure','insurance','accommodation','religion','photo','documents']) k;update public.enrollments set group_id='30000000-0000-4000-8000-000000000001',photo_consent='No autorizado' where id='20000000-0000-4000-8000-000000000001';`);const r=await role(ADMIN,"select * from public.confirm_enrollments(array['20000000-0000-4000-8000-000000000001']::uuid[])");expect(r.rows).toHaveLength(1);const result=await pg.query<{status:string;confirmed_by:string}>('select status,confirmed_by from public.enrollments');expect(result.rows[0].status).toBe('Activo');expect(result.rows[0].confirmed_by).toBe(ADMIN)});it('impide desbordar el cupo desde una escritura directa',async()=>{await pg.exec(`insert into public.students(id,identification,id_type,name,surname1,birthdate) values('10000000-0000-4000-8000-000000000002','DEMO00002','Prueba','Otro','Ficticio','2010-01-01');insert into public.enrollments(id,student_id,year,group_id) values('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',2027,'30000000-0000-4000-8000-000000000001');`);await expect(role(ADMIN,"update public.enrollments set status='Activo' where id='20000000-0000-4000-8000-000000000002'")).rejects.toThrow(/cupo/)});it('declara privados todos los buckets y restringe los médicos (metadatos simulados)',async()=>{await pg.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update on storage.objects to authenticated;`);await pg.exec(readFileSync('supabase/migrations/20261104212241_private_storage.sql','utf8'));const r=await pg.query<{public:boolean}>('select public from storage.buckets');expect(r.rows).toHaveLength(3);expect(r.rows.every(v=>!v.public)).toBe(true);await pg.exec("insert into storage.objects(bucket_id,name) values('medical-documents','prueba.pdf')");expect((await role(READER,'select * from storage.objects')).rows).toHaveLength(0);expect((await role(ADMIN,'select * from storage.objects')).rows).toHaveLength(1)});it('rechaza carga documental de un lector',async()=>await expect(role(READER,"insert into storage.objects(bucket_id,name) values('student-documents','prueba.pdf')")).rejects.toThrow())});

describe('Actualización de cupo compartido',()=>{
  it('registra activos por RPC, conserva el origen importado y revierte el alta al exceder 34',async()=>{
    await pg.exec(readFileSync('supabase/migrations/20261106120000_section_capacity_and_manual_registration.sql','utf8'));
    await pg.exec("insert into public.academic_groups(year,grade,section,subgroup,capacity) values(2027,8,4,'A',18),(2027,8,4,'B',18)");
    const signup=(n:number,subgroup:string)=>role(ADMIN,`select public.register_manual_enrollment(
      '{"identification":"CAPTEST${n}","idType":"Prueba","name":"Ana","surname1":"Mora"}'::jsonb,
      '{"year":2027,"grade":8,"section":"4","subgroup":"${subgroup}"}'::jsonb)`);
    for(let n=1;n<=34;n++)await signup(n,n%2?'A':'B');
    await expect(signup(35,'B')).rejects.toThrow(/capacidad máxima de 34/);
    expect((await pg.query("select active_count from private.section_occupancy where year=2027 and grade=8 and section=4")).rows).toEqual([{active_count:34}]);
    expect((await pg.query("select identification from public.students where identification='CAPTEST35'")).rows).toEqual([]);
    await pg.exec(`insert into public.students(identification,id_type,name,surname1) values('CAPIMPORT','Prueba','Ana','Mora');
      insert into public.enrollments(student_id,year) select id,2027 from public.students where identification='CAPIMPORT'`);
    expect((await pg.query("select status,registration_origin from public.enrollments where student_id=(select id from public.students where identification='CAPIMPORT')")).rows)
      .toEqual([{status:'Inactivo',registration_origin:'import'}]);
    await expect(role(UNAUTHORIZED,"select public.register_manual_enrollment('{}','{}')")).rejects.toThrow(/Acceso denegado/);
  });
});


it('concilia la distribución de género con matrículas activas consultadas en PostgreSQL',async()=>{
  await pg.exec(`update public.students set gender='Femenino' where identification='CAPTEST1';
    update public.students set gender='Masculino' where identification='CAPTEST2';
    update public.students set gender='Otro' where identification='CAPTEST3';`);
  const {rows}=await pg.query<{student_id:string;id:string;year:number;grade:number;section:number;subgroup:string;gender:string}>(`
    select e.student_id,e.id,e.year,g.grade,g.section,g.subgroup,s.gender
    from public.enrollments e
    join public.students s on s.id=e.student_id
    join public.academic_groups g on g.id=e.group_id
    where e.year=2027 and e.status='Activo' and g.grade=8 and g.section=4
  `);
  const records=rows.map((record):Row=>({
    student:{...blankStudent(),id:record.student_id,gender:record.gender},
    enrollment:{...blankEnrollment(record.student_id,record.year,[]),id:record.id,
      grade:record.grade,section:String(record.section),subgroup:record.subgroup,status:'Activo'},
  }));
  const {rows:[database]}=await pg.query<{total:number;male:number;female:number;other:number;unspecified:number}>(`
    select count(*)::int as total,
      count(*) filter(where s.gender='Masculino')::int as male,
      count(*) filter(where s.gender='Femenino')::int as female,
      count(*) filter(where s.gender='Otro')::int as other,
      count(*) filter(where s.gender='No indicado')::int as unspecified
    from public.enrollments e join public.students s on s.id=e.student_id
    join public.academic_groups g on g.id=e.group_id
    where e.year=2027 and e.status='Activo' and g.grade=8 and g.section=4
  `);
  const statistics=genderBySection(records,[]);
  expect(statistics.totals).toEqual(database);
  expect(statistics.sections).toEqual([{name:'8-4',...database}]);
});

it('lee el centro de procedencia de una matrícula ficticia nueva en la base aislada de pruebas',async()=>{
  // pg is the disposable in-memory PGlite instance created by this suite.
  await role(ADMIN,`select public.register_manual_enrollment(
    '{"identification":"QAORIGIN07","idType":"Prueba","name":"Persona","surname1":"Ficticia","previousSchool":"Escuela de Prueba de Cañas, Guanacaste"}'::jsonb,
    '{"year":2027,"grade":7,"section":"1","subgroup":"A"}'::jsonb)`);
  const {rows}=await pg.query<{student_id:string;identification:string;previous_school:string;id:string;year:number;grade:number;section:number;status:Row['enrollment']['status']}>(`
    select s.id as student_id,s.identification,s.previous_school,e.id,e.year,g.grade,g.section,e.status
    from public.students s join public.enrollments e on e.student_id=s.id
    join public.academic_groups g on g.id=e.group_id where s.identification='QAORIGIN07'
  `);
  const records=rows.map((record):Row=>({
    student:{...blankStudent(),id:record.student_id,identification:record.identification,previousSchool:record.previous_school},
    enrollment:{...blankEnrollment(record.student_id,record.year,[]),id:record.id,grade:record.grade,section:String(record.section),status:record.status},
  }));
  const report=seventhGradeRows(records,2027,'7-1');
  expect(report.map(row=>[reportValue(row,'identification'),reportValue(row,'previousSchool')]))
    .toEqual([['QAORIGIN07','Escuela de Prueba de Cañas, Guanacaste']]);
});

describe('Imágenes e historial de traslados en PostgreSQL aislado',()=>{
  it('aplica la migración y verifica las políticas y las referencias de Storage',async()=>{
    await pg.exec(readFileSync('supabase/migrations/20261106200429_report_artwork_and_transfer_history.sql','utf8'));
    const original='header/50000000-0000-4000-8000-000000000001.png';
    const replacement='header/50000000-0000-4000-8000-000000000002.jpg';
    const footer='footer/50000000-0000-4000-8000-000000000003.jpg';
    await expect(role(READER,`insert into storage.objects(bucket_id,name) values('report-artwork','${original}')`)).rejects.toThrow();
    await expect(role(ADMIN,`update public.report_artwork set mode='custom',object_path='${original}' where slot='header'`)).rejects.toThrow(/no está disponible/);
    await role(ADMIN,`insert into storage.objects(bucket_id,name) values('report-artwork','${original}'),('report-artwork','${replacement}'),('report-artwork','${footer}')`);
    await role(ADMIN,`update public.report_artwork set mode='custom',object_path='${original}' where slot='header'`);
    await role(ADMIN,`update public.report_artwork set mode='custom',object_path='${replacement}' where slot='header'`);
    await role(ADMIN,`update public.report_artwork set mode='custom',object_path='${footer}' where slot='footer'`);
    expect((await role(READER,"select name from storage.objects where bucket_id='report-artwork' order by name")).rows).toEqual([{name:footer},{name:replacement}]);
    expect((await role(READER,"update public.report_artwork set mode='hidden',object_path=null where slot='header' returning slot")).rows).toEqual([]);
    expect((await role(UNAUTHORIZED,'select slot from public.report_artwork')).rows).toEqual([]);
    expect((await role(ADMIN,'select slot,revision from public.report_artwork order by slot')).rows).toEqual([{slot:'footer',revision:1},{slot:'header',revision:2}]);
  });

  it('conserva fecha y nivel de cada traslado cuando cambia la matrícula',async()=>{
    // Only the disposable test enrollment created here is updated.
    const fixture=(await role(ADMIN,`select public.register_manual_enrollment(
      '{"identification":"QATRANSFER","idType":"Prueba","name":"Persona","surname1":"Ficticia"}'::jsonb,
      '{"year":2027,"grade":7,"section":"1","subgroup":"A"}'::jsonb)`)).rows;
    expect(fixture).toHaveLength(1);
    const filter="where student_id=(select id from public.students where identification='QATRANSFER')";
    await role(ADMIN,`update public.enrollments set status='Traslado',effective_date='2027-02-20' ${filter}`);
    await role(ADMIN,`update public.enrollments set effective_date='2027-02-21' ${filter}`);
    await role(ADMIN,`update public.enrollments set status='Inactivo',effective_date=null ${filter}`);
    await role(ADMIN,`update public.enrollments set status='Traslado',effective_date='2027-05-14',group_id=(select id from public.academic_groups where year=2027 and grade=8 and section=4 and subgroup='A') ${filter}`);
    await role(ADMIN,`update public.enrollments set status='Inactivo',effective_date=null ${filter}`);
    const report="select transfer_date::text,transfer_grade,transfer_name,transfer_identification from public.report_transfers where transfer_identification='QATRANSFER' order by transfer_date";
    expect((await role(ADMIN,report)).rows).toEqual([
      {transfer_date:'2027-02-21',transfer_grade:7,transfer_name:'Persona Ficticia',transfer_identification:'QATRANSFER'},
      {transfer_date:'2027-05-14',transfer_grade:8,transfer_name:'Persona Ficticia',transfer_identification:'QATRANSFER'},
    ]);
    for(const account of [READER,UNAUTHORIZED,TEMP])expect((await role(account,report)).rows).toEqual([]);
  });
});
