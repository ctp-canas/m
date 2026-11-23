-- Execute only after making a backup and pausing institutional writes.
begin;
lock table public.academic_groups, public.enrollments in share row exclusive mode;
do $$ begin
  if exists (
    select 1 from public.academic_groups group by year,grade,section,subgroup having count(*)>1
  ) then
    raise exception 'La versión anterior no admite varias especialidades en la misma sección. Resuelva la configuración antes de revertir.';
  end if;
end $$;
drop function public.register_manual_enrollment(jsonb,jsonb);
drop trigger section_occupancy_after_change on public.enrollments;
drop function private.adjust_section_occupancy();
drop table private.section_occupancy;
create or replace function private.check_enrollment() returns trigger language plpgsql security definer set search_path='' as $$
declare cap integer; used integer; st public.students; medical_ok boolean; begin
 if not exists(select 1 from public.academic_years where year=new.year and status='Abierto') then raise exception 'El curso lectivo no está abierto'; end if;
 if tg_op='INSERT' and new.status<>'Inactivo' then raise exception 'Una nueva matrícula debe ser inactiva'; end if;
 if tg_op='UPDATE' and old.student_id<>new.student_id then raise exception 'No se puede cambiar la identidad de una matrícula'; end if;
 if new.status='Activo' then
 if not private.can('enrollments.confirm') then raise exception 'Sin permiso para confirmar matrícula'; end if;
 select capacity into cap from public.academic_groups where id=new.group_id and year=new.year for update;
 if cap is null then raise exception 'Asigne un grupo válido'; end if;
 select count(*) into used from public.enrollments where group_id=new.group_id and status='Activo' and id<>new.id;
 if used>=cap then raise exception 'El grupo no tiene cupo'; end if;
 select * into st from public.students where id=new.student_id;
 if st.birthdate is null or st.birthdate>current_date then raise exception 'Complete la fecha de nacimiento'; end if;
 if not exists(select 1 from public.addresses where student_id=new.student_id and length(trim(address))>0 and length(trim(canton))>0 and length(trim(district))>0) then raise exception 'Complete el domicilio'; end if;
 if not exists(select 1 from public.guardians where student_id=new.student_id and is_primary and length(trim(name))>0 and phone ~ '^\+?[0-9 -]{8,15}$') then raise exception 'Registre el encargado principal'; end if;
 if (select count(*) from public.enrollment_verifications where enrollment_id=new.id and verified)<>11 then raise exception 'Complete las verificaciones'; end if;
 if not exists(select 1 from public.accommodations where enrollment_id=new.id and verified_at is not null) then raise exception 'Verifique las adecuaciones'; end if;
 select exists(select 1 from public.medical_records where enrollment_id=new.id and information_state<>'Sin información' and verified_at is not null) into medical_ok;
 if not medical_ok then raise exception 'Verifique la información médica'; end if;
 if new.photo_consent='Pendiente' then raise exception 'Registre la autorización de fotografías'; end if;
 if exists(select 1 from public.document_requirements dr where dr.active and not exists(select 1 from public.student_documents sd where sd.enrollment_id=new.id and sd.requirement_id=dr.id and sd.status in ('Verificado','No aplica'))) then raise exception 'Verifique la documentación'; end if;
 new.confirmed_at=now();new.confirmed_by=auth.uid();
 end if;
 new.updated_at=now();
 if tg_op='UPDATE' then new.version=old.version+1; end if;
 return new; end $$;
alter table public.enrollments
  drop constraint enrollments_section_location,
  drop column group_grade,
  drop column group_section,
  drop column registration_origin;
alter table public.academic_groups
  drop constraint academic_groups_location_key,
  drop constraint academic_groups_assignment_key,
  add constraint academic_groups_year_grade_section_subgroup_key unique(year,grade,section,subgroup);
commit;
