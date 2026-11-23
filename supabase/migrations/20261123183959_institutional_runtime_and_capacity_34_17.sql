begin;
lock table public.enrollments,public.academic_groups in share row exclusive mode;

alter table public.students add column details jsonb not null default '{}';
alter table public.enrollments add column details jsonb not null default '{}';
alter table public.academic_groups drop constraint academic_groups_check;
alter table public.academic_groups add constraint academic_groups_assignment_valid check(
  capacity between 1 and 17 and subgroup in ('','A','B','C','D')
  and ((grade<=9 and subgroup<>'' and specialty_id is null) or grade>=10)
) not valid;
-- Older groups keep historical data. Their configured limits are reduced safely.
update public.academic_groups set capacity=least(capacity,17);

create policy confidential_student_details on public.students as restrictive
for select to authenticated using ((select private.can('medical.read') and private.can('students.read')));
create policy confidential_enrollment_details on public.enrollments as restrictive
for select to authenticated using ((select private.can('medical.read') and private.can('students.read')));

create table public.application_control(
  id integer primary key check(id=1),
  revision integer not null default 0,
  settings jsonb not null,
  report_templates jsonb not null default '[]'
);
alter table public.application_control enable row level security;
revoke all on public.application_control from public,anon,authenticated;
grant select,update on public.application_control to authenticated;
create policy authorized_read on public.application_control for select to authenticated
using ((select private.can('students.read')));
create policy authorized_update on public.application_control for update to authenticated
using ((select private.can('students.write'))) with check ((select private.can('students.write')));
insert into public.application_control(id,settings) values(1,
 '{"institution":"Colegio Técnico Profesional de Cañas","phone":"2688-9015","email":"","insuranceThreshold":15,"documents":[],"specialties":[]}'
);

-- Medical and guardian details in these records remain subject to the restrictive policies.
create function private.guard_application_control() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.id<>old.id or new.revision<>old.revision+1 then raise exception 'Revisión inválida'; end if;
 if new.settings is distinct from old.settings and not private.can('configuration.write') then
   raise exception 'Sin permiso para cambiar la configuración';
 end if;
 return new;
end $$;
revoke all on function private.guard_application_control() from public,anon,authenticated;
create trigger application_control_guard before update on public.application_control
for each row execute function private.guard_application_control();

create function private.guard_group_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.year,new.grade,new.section,new.subgroup,new.specialty_id) is distinct from
    (old.year,old.grade,old.section,old.subgroup,old.specialty_id)
    and exists(select 1 from public.enrollments where group_id=old.id) then
   raise exception 'El grupo tiene matrículas y debe conservar su ubicación académica';
 end if;
 return new;
end $$;
revoke all on function private.guard_group_assignment() from public,anon,authenticated;
create trigger guard_group_assignment before update on public.academic_groups
for each row execute function private.guard_group_assignment();

create or replace function private.check_enrollment() returns trigger
language plpgsql security definer set search_path='' as $$
declare st public.students; g public.academic_groups; steps jsonb;
begin
 if not exists(select 1 from public.academic_years where year=new.year and status='Abierto') then
   raise exception 'El curso lectivo no está abierto';
 end if;
 if tg_op='UPDATE' and (new.student_id,new.year,new.registration_origin) is distinct from
    (old.student_id,old.year,old.registration_origin) then
   raise exception 'No se puede cambiar la identidad, el curso ni el origen';
 end if;
 if tg_op='INSERT' and ((new.registration_origin='manual' and new.status<>'Activo')
   or (new.registration_origin='import' and new.status<>'Inactivo') or new.registration_origin='historical') then
   raise exception 'El estado inicial no corresponde al origen de matrícula';
 end if;
 select * into g from public.academic_groups where id=new.group_id and year=new.year;
 new.group_grade:=g.grade; new.group_section:=g.section;
 if new.status='Activo' then
   if g.id is null or (g.grade>=10 and g.specialty_id is null) then
     raise exception 'Seleccione un grupo con especialidad configurada';
   end if;
   if (tg_op='INSERT' or old.status<>'Activo' or old.group_id is distinct from new.group_id)
       and not private.can('enrollments.confirm') then raise exception 'Sin permiso para confirmar matrícula'; end if;
   if tg_op='UPDATE' and old.status<>'Activo' then
     select * into st from public.students where id=new.student_id;
     if st.birthdate is null or st.birthdate>current_date then raise exception 'Complete la fecha de nacimiento'; end if;
     if nullif(trim(st.details->>'address'),'') is null then raise exception 'Complete el domicilio'; end if;
     if not exists(select 1 from jsonb_array_elements(coalesce(st.details->'guardians','[]')) v
       where coalesce((v->>'primary')::boolean,false) and length(trim(v->>'name'))>0 and v->>'phone' ~ '^\+?[0-9 -]{8,15}$')
       then raise exception 'Registre el encargado principal'; end if;
     steps:=coalesce(new.details->'verified','[]');
     if not steps @> '["Identificación","Datos personales","Ubicación académica","Domicilio","Encargados legales","Autorización de salida","Póliza","Adecuaciones","Educación Religiosa","Autorización de fotografía","Verificación médica","Documentación"]'::jsonb
       then raise exception 'Complete la verificación de matrícula'; end if;
     if coalesce(new.details#>>'{medical,state}','Sin información')='Sin información'
       or new.photo_consent='Pendiente' then raise exception 'Verifique información médica y autorización de fotografías'; end if;
   end if;
   if tg_op='INSERT' or old.status<>'Activo' then new.confirmed_at:=now(); new.confirmed_by:=auth.uid();
   else new.confirmed_at:=old.confirmed_at; new.confirmed_by:=old.confirmed_by; end if;
 end if;
 if tg_op='UPDATE' then new.version:=old.version+1; end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;

create or replace function private.adjust_section_occupancy() returns trigger
language plpgsql security definer set search_path='' as $$
declare used integer; g public.academic_groups;
begin
 -- A global transaction lock orders section/subgroup moves and concurrent direct writes.
 -- Counter updates serialize before reading actual membership in a fresh statement.
 perform pg_advisory_xact_lock(64034017);
 if tg_op<>'INSERT' and old.status='Activo' and old.group_grade is not null then
   update private.section_occupancy set active_count=active_count-1
   where (year,grade,section)=(old.year,old.group_grade,old.group_section);
 end if;
 if tg_op<>'DELETE' and new.status='Activo' then
   insert into private.section_occupancy(year,grade,section,active_count)
   values(new.year,new.group_grade,new.group_section,1)
   on conflict(year,grade,section) do update set active_count=private.section_occupancy.active_count+1
   returning active_count into used;
   if used>34 then raise exception 'La sección alcanzó su capacidad máxima de 34 estudiantes'; end if;
   select * into g from public.academic_groups where id=new.group_id;
   if g.subgroup<>'' and (select count(*) from public.enrollments e join public.academic_groups a on a.id=e.group_id
      where e.status='Activo' and a.year=g.year and a.grade=g.grade and a.section=g.section and a.subgroup=g.subgroup)>17
      then raise exception 'El subgrupo alcanzó su capacidad máxima de 17 estudiantes'; end if;
   if g.specialty_id is not null and (select count(*) from public.enrollments e join public.academic_groups a on a.id=e.group_id
      where e.status='Activo' and a.year=g.year and a.grade=g.grade and a.section=g.section and a.specialty_id=g.specialty_id)>17
      then raise exception 'La especialidad alcanzó su capacidad máxima de 17 estudiantes en esta sección'; end if;
 end if;
 return null;
end $$;

create function private.self_account() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('identification',identification,'name',display_name,
   'mustChangePassword',must_change_password,'permissions',permissions,'active',active)
 from private.accounts where user_id=auth.uid()
$$;
revoke all on function private.self_account() from public,anon,authenticated;
grant execute on function private.self_account() to authenticated;
create function public.current_account() returns jsonb language sql stable security invoker set search_path='' as $$
 select private.self_account()
$$;
revoke all on function public.current_account() from public,anon,authenticated;
grant execute on function public.current_account() to authenticated;

-- Only the identified school owner can initialize the administrator through verified email.
create table private.bootstrap_admin(email text primary key,identification text not null);
alter table private.bootstrap_admin enable row level security;
revoke all on private.bootstrap_admin from public,anon,authenticated;
grant all on private.bootstrap_admin to service_role;

create function private.bootstrap_school_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and exists(select 1 from private.bootstrap_admin where email=lower(new.email)) then
   insert into private.accounts(user_id,identification,auth_email,display_name,must_change_password,permissions)
   select new.id,b.identification,new.email,'Administrador institucional',true,array['*'] from private.bootstrap_admin b where b.email=lower(new.email)
   on conflict(user_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.bootstrap_school_owner() from public,anon,authenticated;
create trigger school_owner_after_verified_email after insert or update of email_confirmed_at on auth.users
for each row execute function private.bootstrap_school_owner();

create function public.load_application() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not private.can('students.read') or not private.can('medical.read') or not private.can('configuration.read') then raise exception 'Acceso denegado'; end if;
 select jsonb_build_object(
  'revision',c.revision,'settings',c.settings,'reportTemplates',c.report_templates,
  'years',(select coalesce(jsonb_agg(to_jsonb(y) order by year),'[]') from public.academic_years y),
  'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'year',g.year,'grade',g.grade,
     'section',g.section::text,'subgroup',g.subgroup,'specialty',coalesce(s.name,''),'capacity',17) order by g.grade,g.section,g.subgroup),'[]')
     from public.academic_groups g left join public.specialties s on s.id=g.specialty_id),
  'students',(select coalesce(jsonb_agg(s.details||jsonb_build_object('id',s.id,'identification',s.identification,'idType',s.id_type,
     'name',s.name,'surname1',s.surname1,'surname2',s.surname2,'birthdate',coalesce(s.birthdate::text,''),'gender',s.gender,
     'previousSchool',coalesce(s.previous_school,''),'createdAt',s.created_at)),'[]') from public.students s),
  'enrollments',(select coalesce(jsonb_agg(e.details||jsonb_build_object('id',e.id,'studentId',e.student_id,'year',e.year,
     'status',e.status,'effectiveDate',e.effective_date,'updatedAt',e.updated_at,'confirmedAt',e.confirmed_at)),'[]') from public.enrollments e),
  'transferEvents',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'enrollmentId',t.enrollment_id,'year',t.year,'date',t.transfer_date,
     'grade',t.transfer_grade,'section',coalesce(t.transfer_section::text,''),'name',t.transfer_name,'identification',t.transfer_identification)),'[]') from public.report_transfers t),
  'audit',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'at',a.occurred_at,'actor',coalesce(a.actor::text,'Sistema'),
     'action',a.action,'record',concat(a.table_name,' ',a.record_id)) order by a.occurred_at desc),'[]')
     from (select * from public.audit_log order by occurred_at desc limit 300) a)
 ) into result from public.application_control c where id=1;
 return result;
end $$;
-- Audit actor names are resolved separately without granting access to private accounts.

create function public.save_application(next_state jsonb,expected_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 current_control public.application_control;
 entry jsonb;
 new_settings jsonb:=next_state->'settings';
 sid uuid;
 gid uuid;
 specialty uuid;
 old_student public.students;
 old_enrollment public.enrollments;
 old_group public.academic_groups;
 source text;
begin
 if not private.can('students.write') or not private.can('medical.write') then raise exception 'Sin permiso para guardar expedientes'; end if;
 select * into current_control from public.application_control where id=1 for update;
 if current_control.revision<>expected_revision then
   raise exception 'Los datos cambiaron en otra computadora. Actualice la información antes de guardar.';
 end if;
 if octet_length(next_state::text)>50000000 then raise exception 'La solicitud supera el tamaño permitido'; end if;
 if exists(select 1 from public.students s where not exists(select 1 from jsonb_array_elements(next_state->'students') v where v->>'id'=s.id::text))
    or exists(select 1 from public.enrollments e where not exists(select 1 from jsonb_array_elements(next_state->'enrollments') v where v->>'id'=e.id::text))
    or exists(select 1 from public.academic_groups g where not exists(select 1 from jsonb_array_elements(next_state->'groups') v where v->>'id'=g.id::text))
    then raise exception 'No se permite eliminar expedientes ni grupos desde un guardado'; end if;

 for entry in select value from jsonb_array_elements(next_state->'years') loop
   if not exists(select 1 from public.academic_years where year=(entry->>'year')::int) then
     insert into public.academic_years(year,status) values((entry->>'year')::int,entry->>'status');
   end if;
 end loop;
 if new_settings is distinct from current_control.settings then
   if not private.can('configuration.write') then raise exception 'Sin permiso para editar configuración'; end if;
   for entry in select value from jsonb_array_elements(new_settings->'specialties') loop
     insert into public.specialties(name) values(trim(entry#>>'{}'))
     on conflict(name) do update set active=true;
   end loop;
   update public.specialties set active=false where not new_settings->'specialties' @> jsonb_build_array(name);
 end if;
 for entry in select value from jsonb_array_elements(next_state->'groups') loop
   specialty:=null;
   if nullif(entry->>'specialty','') is not null then
     select id into specialty from public.specialties where name=entry->>'specialty' and active;
     if specialty is null then raise exception 'Agregue la especialidad en Configuración antes de asignarla'; end if;
   end if;
   select * into old_group from public.academic_groups where id=(entry->>'id')::uuid;
   if old_group.id is not null and
     (old_group.year,old_group.grade,old_group.section,old_group.subgroup,old_group.specialty_id) is distinct from
     ((entry->>'year')::int,(entry->>'grade')::smallint,(entry->>'section')::smallint,entry->>'subgroup',specialty)
     and exists(select 1 from public.enrollments where group_id=old_group.id)
     then raise exception 'El grupo tiene matrículas. Cree otro grupo para conservar el historial'; end if;
   if old_group.id is not null and
     (old_group.year,old_group.grade,old_group.section,old_group.subgroup,old_group.specialty_id) is not distinct from
     ((entry->>'year')::int,(entry->>'grade')::smallint,(entry->>'section')::smallint,entry->>'subgroup',specialty) then
     continue;
   end if;
   insert into public.academic_groups(id,year,grade,section,subgroup,specialty_id,capacity)
   values((entry->>'id')::uuid,(entry->>'year')::int,(entry->>'grade')::smallint,(entry->>'section')::smallint,entry->>'subgroup',specialty,17)
   on conflict(id) do update set year=excluded.year,grade=excluded.grade,section=excluded.section,
     subgroup=excluded.subgroup,specialty_id=excluded.specialty_id,capacity=17
   where (academic_groups.year,academic_groups.grade,academic_groups.section,academic_groups.subgroup,academic_groups.specialty_id)
     is distinct from (excluded.year,excluded.grade,excluded.section,excluded.subgroup,excluded.specialty_id);
 end loop;
 for entry in select value from jsonb_array_elements(next_state->'students') loop
   if octet_length(coalesce(entry->>'photo',''))>2800000 then raise exception 'La fotografía supera 2 MB'; end if;
   insert into public.students(id,identification,id_type,name,surname1,surname2,birthdate,gender,previous_school,details)
   values((entry->>'id')::uuid,trim(entry->>'identification'),entry->>'idType',trim(entry->>'name'),trim(entry->>'surname1'),
     coalesce(entry->>'surname2',''),nullif(entry->>'birthdate','')::date,entry->>'gender',nullif(entry->>'previousSchool',''),entry)
   on conflict(id) do update set identification=excluded.identification,id_type=excluded.id_type,name=excluded.name,
     surname1=excluded.surname1,surname2=excluded.surname2,birthdate=excluded.birthdate,gender=excluded.gender,
     previous_school=excluded.previous_school,details=excluded.details,updated_at=clock_timestamp(),version=students.version+1
   where (students.identification,students.id_type,students.name,students.surname1,students.surname2,students.birthdate,
     students.gender,students.previous_school,students.details) is distinct from
     (excluded.identification,excluded.id_type,excluded.name,excluded.surname1,excluded.surname2,excluded.birthdate,
     excluded.gender,excluded.previous_school,excluded.details);
 end loop;
 for entry in select value from jsonb_array_elements(next_state->'enrollments') loop
   sid:=(entry->>'studentId')::uuid;
   gid:=null;
   select * into old_enrollment from public.enrollments where id=(entry->>'id')::uuid;
   if nullif(entry->>'section','') is not null then
     select g.id into gid from public.academic_groups g left join public.specialties sp on sp.id=g.specialty_id
     where g.year=(entry->>'year')::int and g.grade=(entry->>'grade')::smallint
       and g.section=(entry->>'section')::smallint and g.subgroup=coalesce(entry->>'subgroup','')
       and coalesce(sp.name,'')=coalesce(entry->>'specialty','');
     if gid is null then raise exception 'Seleccione un grupo configurado'; end if;
   end if;
   source:=coalesce(old_enrollment.registration_origin,case when entry->>'status'='Activo' then 'manual' else 'import' end);
   insert into public.enrollments(id,student_id,year,group_id,status,registration_origin,academic_condition,religion,photo_consent,effective_date,details)
   values((entry->>'id')::uuid,sid,(entry->>'year')::int,gid,entry->>'status',source,entry->>'condition',
     (entry->>'religion')::boolean,entry->>'photoConsent',nullif(entry->>'effectiveDate','')::date,entry)
   on conflict(id) do update set group_id=excluded.group_id,status=excluded.status,academic_condition=excluded.academic_condition,
     religion=excluded.religion,photo_consent=excluded.photo_consent,effective_date=excluded.effective_date,details=excluded.details
   where (enrollments.group_id,enrollments.status,enrollments.academic_condition,enrollments.religion,
     enrollments.photo_consent,enrollments.effective_date,enrollments.details) is distinct from
     (excluded.group_id,excluded.status,excluded.academic_condition,excluded.religion,
     excluded.photo_consent,excluded.effective_date,excluded.details);
 end loop;
 for entry in select value from jsonb_array_elements(next_state->'years') loop
   update public.academic_years set status=entry->>'status' where year=(entry->>'year')::int and status is distinct from entry->>'status';
 end loop;
 update public.application_control set revision=revision+1,settings=new_settings,
   report_templates=coalesce(next_state->'reportTemplates','[]') where id=1;
 return public.load_application();
end $$;
-- Avoid name ambiguity between the PL/pgSQL settings variable and the table column.
create function public.manage_account(target uuid,identity_number text,email_address text,account_name text,rights text[],enabled boolean)
returns void language sql security invoker set search_path='' as $$
 update private.accounts set identification=identity_number,auth_email=email_address,
   display_name=account_name,permissions=rights,active=enabled where user_id=target
$$;
revoke all on function public.manage_account(uuid,text,text,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.manage_account(uuid,text,text,text,text[],boolean) to service_role;

create function public.list_accounts() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'identification',identification,'email',auth_email,
 'name',display_name,'active',active,'mustChangePassword',must_change_password,'permissions',permissions)
 order by display_name),'[]') from private.accounts
$$;
revoke all on function public.list_accounts() from public,anon,authenticated;
grant execute on function public.list_accounts() to service_role;

revoke all on function public.load_application() from public,anon,authenticated;
revoke all on function public.save_application(jsonb,integer) from public,anon,authenticated;
grant execute on function public.load_application() to authenticated;
grant execute on function public.save_application(jsonb,integer) to authenticated;
commit;
