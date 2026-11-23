begin;
create or replace function public.save_application(next_state jsonb,expected_revision integer) returns jsonb
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
   if old_enrollment.id is not null and
     (old_enrollment.details-array['updatedAt','confirmedAt']) is not distinct from (entry-array['updatedAt','confirmedAt']) then
     continue;
   end if;
   if nullif(entry->>'section','') is not null then
     select g.id into gid from public.academic_groups g left join public.specialties sp on sp.id=g.specialty_id
     where g.year=(entry->>'year')::int and g.grade=(entry->>'grade')::smallint
       and g.section=(entry->>'section')::smallint and g.subgroup=coalesce(entry->>'subgroup','')
       and coalesce(sp.name,'')=coalesce(entry->>'specialty','');
     if gid is null then raise exception 'Seleccione un grupo configurado'; end if;
   end if;
   source:=coalesce(old_enrollment.registration_origin,case when entry->>'status'='Activo' then 'manual' else 'import' end);
   if old_enrollment.id is null then
     insert into public.enrollments(id,student_id,year,group_id,status,registration_origin,academic_condition,religion,photo_consent,effective_date,details)
     values((entry->>'id')::uuid,sid,(entry->>'year')::int,gid,entry->>'status',source,entry->>'condition',
       (entry->>'religion')::boolean,entry->>'photoConsent',nullif(entry->>'effectiveDate','')::date,entry);
   else
     if old_enrollment.student_id<>sid or old_enrollment.year<>(entry->>'year')::int then
       raise exception 'No se puede cambiar la identidad ni el curso de una matrícula';
     end if;
     update public.enrollments set group_id=gid,status=entry->>'status',academic_condition=entry->>'condition',
       religion=(entry->>'religion')::boolean,photo_consent=entry->>'photoConsent',
       effective_date=nullif(entry->>'effectiveDate','')::date,details=entry
     where id=old_enrollment.id;
   end if;
 end loop;
 for entry in select value from jsonb_array_elements(next_state->'years') loop
   update public.academic_years set status=entry->>'status' where year=(entry->>'year')::int and status is distinct from entry->>'status';
 end loop;
 update public.application_control set revision=revision+1,settings=new_settings,
   report_templates=coalesce(next_state->'reportTemplates','[]') where id=1;
 return public.load_application();
end $$;

commit;
