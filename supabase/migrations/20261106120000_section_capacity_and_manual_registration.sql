begin;
lock table public.academic_groups, public.enrollments in share row exclusive mode;

-- Keep the historical group capacity field. The actual limit is shared by the section.
alter table public.academic_groups drop constraint academic_groups_year_grade_section_subgroup_key;
alter table public.academic_groups add constraint academic_groups_assignment_key
  unique nulls not distinct (year,grade,section,subgroup,specialty_id);
alter table public.academic_groups add constraint academic_groups_location_key unique(id,year,grade,section);

alter table public.enrollments
  add column registration_origin text not null default 'historical'
    check (registration_origin in ('historical','import','manual')),
  add column group_grade smallint,
  add column group_section smallint;
alter table public.enrollments alter column registration_origin set default 'import';

-- Populate routing keys for historical records without generating audit/status events.
alter table public.enrollments disable trigger user;
update public.enrollments e set group_grade=g.grade, group_section=g.section
from public.academic_groups g where g.id=e.group_id and g.year=e.year;
alter table public.enrollments enable trigger user;
alter table public.enrollments add constraint enrollments_section_location
  foreign key(group_id,year,group_grade,group_section) references public.academic_groups(id,year,grade,section);

create table private.section_occupancy (
  year integer not null,
  grade smallint not null,
  section smallint not null,
  active_count integer not null default 0 check (active_count>=0),
  primary key(year,grade,section)
);
alter table private.section_occupancy enable row level security;
revoke all on private.section_occupancy from public,anon,authenticated;
insert into private.section_occupancy(year,grade,section,active_count)
select year,group_grade,group_section,count(*) from public.enrollments
where status='Activo' and group_grade is not null
group by year,group_grade,group_section;

create or replace function private.check_enrollment() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  st public.students;
  activating boolean;
begin
  if not exists(select 1 from public.academic_years where year=new.year and status='Abierto') then
    raise exception 'El curso lectivo no está abierto';
  end if;

  if tg_op='INSERT' then
    if new.registration_origin='historical' or
       (new.registration_origin='manual' and new.status<>'Activo') or
       (new.registration_origin='import' and new.status<>'Inactivo') then
      raise exception 'El estado inicial no corresponde al origen de la matrícula';
    end if;
    activating := new.status='Activo';
  else
    if (old.student_id,old.year,old.registration_origin) is distinct from
       (new.student_id,new.year,new.registration_origin) then
      raise exception 'No se puede cambiar la identidad, el curso ni el origen de una matrícula';
    end if;
    activating := new.status='Activo' and old.status<>'Activo';
    new.version := old.version+1;
  end if;

  select g.grade,g.section into new.group_grade,new.group_section
  from public.academic_groups g where g.id=new.group_id and g.year=new.year;
  if new.status='Activo' then
    if new.group_grade is null then raise exception 'Asigne un grupo válido'; end if;
    if activating or (tg_op='UPDATE' and old.group_id is distinct from new.group_id) then
      if not private.can('enrollments.confirm') then raise exception 'Sin permiso para confirmar matrícula'; end if;
    end if;

    -- Imported and previously deactivated records keep the original activation checks.
    if activating and tg_op='UPDATE' then
      select * into st from public.students where id=new.student_id;
      if st.birthdate is null or st.birthdate>current_date then raise exception 'Complete la fecha de nacimiento'; end if;
      if not exists(select 1 from public.addresses where student_id=new.student_id and length(trim(address))>0 and length(trim(canton))>0 and length(trim(district))>0) then raise exception 'Complete el domicilio'; end if;
      if not exists(select 1 from public.guardians where student_id=new.student_id and is_primary and length(trim(name))>0 and phone ~ '^\+?[0-9 -]{8,15}$') then raise exception 'Registre el encargado principal'; end if;
      if (select count(*) from public.enrollment_verifications where enrollment_id=new.id and verified)<>11 then raise exception 'Complete las verificaciones'; end if;
      if not exists(select 1 from public.accommodations where enrollment_id=new.id and verified_at is not null) then raise exception 'Verifique las adecuaciones'; end if;
      if not exists(select 1 from public.medical_records where enrollment_id=new.id and information_state<>'Sin información' and verified_at is not null) then raise exception 'Verifique la información médica'; end if;
      if new.photo_consent='Pendiente' then raise exception 'Registre la autorización de fotografías'; end if;
      if exists(select 1 from public.document_requirements dr where dr.active and not exists(select 1 from public.student_documents sd where sd.enrollment_id=new.id and sd.requirement_id=dr.id and sd.status in ('Verificado','No aplica'))) then raise exception 'Verifique la documentación'; end if;
    elsif activating then
      if exists(select 1 from public.students where id=new.student_id and birthdate>current_date) then
        raise exception 'La fecha de nacimiento no es válida';
      end if;
    end if;
    if activating then
      new.confirmed_at:=now();
      new.confirmed_by:=auth.uid();
    elsif tg_op='UPDATE' then
      new.confirmed_at:=old.confirmed_at;
      new.confirmed_by:=old.confirmed_by;
    end if;
  end if;
  new.updated_at:=now();
  return new;
end $$;

-- An atomic increment on one row serializes competing admissions, even across subgroups.
-- Existing over-capacity sections can reduce occupancy or move students within the same section.
create function private.adjust_section_occupancy() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  leaving boolean := false;
  joining boolean := false;
  source private.section_occupancy%rowtype;
  target private.section_occupancy%rowtype;
begin
  if tg_op<>'INSERT' and old.status='Activo' and old.group_grade is not null then
    leaving:=true;
    source.year:=old.year; source.grade:=old.group_grade; source.section:=old.group_section;
  end if;
  if tg_op<>'DELETE' and new.status='Activo' then
    joining:=true;
    target.year:=new.year; target.grade:=new.group_grade; target.section:=new.group_section;
  end if;

  if leaving and joining and
    (source.year,source.grade,source.section)=(target.year,target.grade,target.section) then
    return null;
  end if;

  if joining then
    insert into private.section_occupancy(year,grade,section) values(target.year,target.grade,target.section)
    on conflict do nothing;
  end if;

  -- Lock two existing counter rows in the same order for moves in either direction.
  if leaving and joining then
    perform 1 from private.section_occupancy c
    where (c.year,c.grade,c.section) in (
      (source.year,source.grade,source.section),(target.year,target.grade,target.section)
    ) order by c.year,c.grade,c.section for update;
  end if;

  if joining then
    update private.section_occupancy c set active_count=active_count+1
    where (c.year,c.grade,c.section)=(target.year,target.grade,target.section) and active_count<34;
    if not found then
      raise exception 'La sección seleccionada ha alcanzado su capacidad máxima de 34 estudiantes. Seleccione otra sección disponible.';
    end if;
  end if;
  if leaving then
    update private.section_occupancy c set active_count=active_count-1
    where (c.year,c.grade,c.section)=(source.year,source.grade,source.section);
    if not found then raise exception 'No se pudo reconciliar el cupo de la sección de origen'; end if;
  end if;
  return null;
end $$;
revoke all on function private.adjust_section_occupancy() from public,anon,authenticated;
create trigger section_occupancy_after_change
after insert or update or delete on public.enrollments
for each row execute function private.adjust_section_occupancy();

-- The browser-facing RPC is invoker. Existing table permissions and RLS remain in force.
create function public.register_manual_enrollment(student jsonb,enrollment jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  sid uuid;
  eid uuid;
  assigned_group uuid;
  entry jsonb;
  medical jsonb := enrollment->'medical';
begin
  if not private.can('students.write') or not private.can('enrollments.confirm') then
    raise exception 'Acceso denegado';
  end if;

  select g.id into assigned_group from public.academic_groups g
  left join public.specialties sp on sp.id=g.specialty_id
  where g.year=(enrollment->>'year')::integer and g.grade=(enrollment->>'grade')::smallint
    and g.section=(enrollment->>'section')::smallint
    and g.subgroup=coalesce(enrollment->>'subgroup','')
    and coalesce(sp.name,'')=coalesce(enrollment->>'specialty','');
  if assigned_group is null then raise exception 'Seleccione un grupo configurado.'; end if;

  insert into public.students(identification,id_type,name,surname1,surname2,birthdate,gender,previous_school)
  values(trim(student->>'identification'),student->>'idType',trim(student->>'name'),trim(student->>'surname1'),
    coalesce(trim(student->>'surname2'),''),nullif(student->>'birthdate','')::date,
    coalesce(student->>'gender','No indicado'),nullif(student->>'previousSchool',''))
  returning id into sid;

  if nullif(trim(student->>'address'),'') is not null then
    insert into public.addresses(student_id,province,canton,district,address)
    values(sid,coalesce(student->>'province',''),coalesce(student->>'canton',''),
      coalesce(student->>'district',''),student->>'address');
  end if;
  for entry in select value from jsonb_array_elements(coalesce(student->'guardians','[]'::jsonb)) loop
    insert into public.guardians(student_id,name,identification,phone,email,relationship,is_primary,departure_authorized)
    values(sid,entry->>'name',entry->>'identification',entry->>'phone',entry->>'email',entry->>'relationship',
      coalesce((entry->>'primary')::boolean,false),coalesce((entry->>'departure')::boolean,false));
  end loop;
  for entry in select value from jsonb_array_elements(coalesce(student->'departureContacts','[]'::jsonb)) loop
    insert into public.departure_contacts(student_id,name,identification,phone)
    values(sid,entry->>'name',entry->>'identification',entry->>'phone');
  end loop;

  insert into public.enrollments(student_id,year,group_id,status,registration_origin,academic_condition,religion,photo_consent)
  values(sid,(enrollment->>'year')::integer,assigned_group,'Activo','manual',
    coalesce(enrollment->>'condition','Regular'),coalesce((enrollment->>'religion')::boolean,true),
    coalesce(enrollment->>'photoConsent','Pendiente'))
  returning id into eid;

  if nullif(enrollment->>'policy','') is not null or nullif(enrollment->>'policyExpiry','') is not null then
    insert into public.insurance(enrollment_id,policy_number,expiry)
    values(eid,nullif(enrollment->>'policy',''),nullif(enrollment->>'policyExpiry','')::date);
  end if;
  if coalesce(enrollment->>'accommodation','NP')<>'NP' then
    insert into public.accommodations(enrollment_id,kind) values(eid,enrollment->>'accommodation');
  end if;
  if coalesce(medical->>'state','Sin información')<>'Sin información' or
    nullif(concat(medical->>'conditions',medical->>'allergies',medical->>'medications',medical->>'contraindications',medical->>'emergency'),'') is not null then
    insert into public.medical_records(enrollment_id,information_state,conditions,allergies,authorized_medications,contraindications,emergency_documentation)
    values(eid,coalesce(medical->>'state','Sin información'),medical->>'conditions',medical->>'allergies',
      medical->>'medications',medical->>'contraindications',medical->>'emergency');
  end if;
  if nullif(trim(enrollment->>'notes'),'') is not null then
    insert into public.administrative_notes(enrollment_id,note,actor) values(eid,enrollment->>'notes',auth.uid());
  end if;
  return eid;
end $$;
revoke all on function public.register_manual_enrollment(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.register_manual_enrollment(jsonb,jsonb) to authenticated;
commit;
