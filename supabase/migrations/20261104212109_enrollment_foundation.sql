-- Foundation for an independent Supabase TEST project. Not applied remotely.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.accounts (
 user_id uuid primary key references auth.users(id), identification text unique not null,
 auth_email text unique not null, display_name text not null,
 active boolean not null default true, must_change_password boolean not null default true,
 permissions text[] not null default '{}', created_at timestamptz not null default now()
);
alter table private.accounts enable row level security;
create function private.can(permission text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.accounts a where a.user_id=auth.uid() and a.active and not a.must_change_password and (permission=any(a.permissions) or '*'=any(a.permissions)))
$$;
revoke all on function private.can(text) from public;
grant usage on schema private to authenticated,service_role;
grant execute on function private.can(text) to authenticated,service_role;
create table public.academic_years(year integer primary key check(year between 2020 and 2100), status text not null check(status in ('Abierto','Cerrado','Preparación')));
create table public.specialties(id uuid primary key default gen_random_uuid(),name text not null unique,active boolean not null default true);
create table public.academic_groups(id uuid primary key default gen_random_uuid(),year integer not null references public.academic_years, grade smallint not null check(grade between 7 and 12),section smallint not null check(section between 1 and 4),subgroup text not null default '',specialty_id uuid references public.specialties,capacity integer not null check(capacity between 1 and 100),check((grade<=9 and subgroup in ('A','B') and specialty_id is null) or (grade>=10 and subgroup='' and specialty_id is not null)),unique(year,grade,section,subgroup),unique(id,year));
create table public.students(id uuid primary key default gen_random_uuid(),identification text not null check(identification ~ '^[A-Za-z0-9-]{5,25}$'),id_type text not null,name text not null check(length(trim(name))>0),surname1 text not null check(length(trim(surname1))>0),surname2 text not null default '',birthdate date,gender text not null default 'No indicado',previous_school text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),version integer not null default 1);
create unique index student_identity_ci on public.students(lower(identification));
create index student_search on public.students(lower(surname1),lower(surname2),lower(name));
create table public.addresses(student_id uuid primary key references public.students,province text not null,canton text not null,district text not null,address text not null);
create table public.guardians(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students,name text not null,identification text,phone text not null,email text,relationship text,is_primary boolean not null default false,departure_authorized boolean not null default false);
create index guardians_student on public.guardians(student_id);
create unique index one_primary_guardian on public.guardians(student_id) where is_primary;
create table public.departure_contacts(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students,name text not null,identification text,phone text not null,restrictions text);
create index departure_student on public.departure_contacts(student_id);
create table public.enrollments(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students,year integer not null references public.academic_years,group_id uuid,status text not null default 'Inactivo' check(status in ('Activo','Inactivo','Traslado','Retiro de matrícula')),academic_condition text not null default 'Regular' check(academic_condition in ('Regular','Aplazado','Convocatoria','Repitente')),religion boolean not null default true,photo_consent text not null default 'Pendiente' check(photo_consent in ('Pendiente','Autorizado','No autorizado')),effective_date date,confirmed_at timestamptz,confirmed_by uuid references auth.users,updated_at timestamptz not null default now(),version integer not null default 1,unique(student_id,year),foreign key(group_id,year) references public.academic_groups(id,year),check(status not in ('Traslado','Retiro de matrícula') or effective_date is not null));
create index enrollment_year_status on public.enrollments(year,status);
create index enrollment_group on public.enrollments(group_id) where status='Activo';
create table public.insurance(enrollment_id uuid primary key references public.enrollments,policy_number text,expiry date,verified_at timestamptz);
create table public.accommodations(enrollment_id uuid primary key references public.enrollments,kind text not null default 'NP' check(kind in ('NP','ACNS','ACS')),verified_at timestamptz,verified_by uuid references auth.users);
create table public.medical_records(enrollment_id uuid primary key references public.enrollments,information_state text not null default 'Sin información' check(information_state in ('Sin información','No posee','Sí posee')),conditions text,allergies text,authorized_medications text,contraindications text,emergency_documentation text,verified_at timestamptz,verified_by uuid references auth.users);
create table public.document_requirements(id uuid primary key default gen_random_uuid(),name text unique not null,active boolean not null default true);
create table public.student_documents(id uuid primary key default gen_random_uuid(),enrollment_id uuid not null references public.enrollments,requirement_id uuid not null references public.document_requirements,status text not null default 'Pendiente' check(status in ('Pendiente','Recibido','Verificado','Rechazado','No aplica')),storage_path text,observations text,verified_at timestamptz,verified_by uuid references auth.users,unique(enrollment_id,requirement_id));
create index documents_enrollment on public.student_documents(enrollment_id);
create table public.enrollment_verifications(enrollment_id uuid not null references public.enrollments,category text not null check(category in ('identity','personal','academic','address','guardians','departure','insurance','accommodation','religion','photo','documents')),verified boolean not null default false,verified_at timestamptz,verified_by uuid references auth.users,primary key(enrollment_id,category));
create table public.enrollment_events(id uuid primary key default gen_random_uuid(),enrollment_id uuid not null references public.enrollments,previous_status text,new_status text not null,effective_at timestamptz not null default now(),actor uuid references auth.users);
create index enrollment_events_record on public.enrollment_events(enrollment_id,effective_at desc);
create table public.administrative_notes(id uuid primary key default gen_random_uuid(),enrollment_id uuid not null references public.enrollments,note text not null,created_at timestamptz not null default now(),actor uuid references auth.users);
create table public.import_batches(id uuid primary key default gen_random_uuid(),year integer not null references public.academic_years,filename text not null,valid_rows integer not null default 0,error_rows integer not null default 0,created_at timestamptz not null default now(),actor uuid references auth.users);
create table public.report_templates(id uuid primary key default gen_random_uuid(),name text not null,columns text[] not null,filters jsonb not null default '{}',owner uuid not null default auth.uid() references auth.users);
create table public.institutional_settings(id integer primary key default 1 check(id=1),name text not null,insurance_threshold integer not null default 15 check(insurance_threshold between 1 and 90),phone text,email text);
create table public.audit_log(id bigint generated always as identity primary key,actor uuid,action text not null,table_name text not null,record_id text,occurred_at timestamptz not null default now());
create index audit_time on public.audit_log(occurred_at desc);
-- Never store copies of confidential medical fields in the audit log.
create function private.record_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.audit_log(actor,action,table_name,record_id) values(auth.uid(),tg_op,tg_table_name,to_jsonb(new)->>'id');
 return new; end $$;
revoke all on function private.record_change() from public;
-- Every exposed table is default-deny, with explicit permission checks.
do $$ declare tbl text; perm text; begin
 foreach tbl in array array['academic_years','specialties','academic_groups','students','addresses','guardians','departure_contacts','enrollments','insurance','accommodations','medical_records','document_requirements','student_documents','enrollment_verifications','enrollment_events','administrative_notes','import_batches','report_templates','institutional_settings','audit_log'] loop
 execute format('alter table public.%I enable row level security',tbl);
 execute format('revoke all on public.%I from anon, authenticated',tbl);
 perm:=case when tbl='medical_records' then 'medical' when tbl='accommodations' then 'accommodations' when tbl='audit_log' then 'audit' when tbl in ('academic_years','specialties','academic_groups','document_requirements','institutional_settings') then 'configuration' else 'students' end;
 execute format('grant select on public.%I to authenticated',tbl);
 execute format('create policy read_access on public.%I for select to authenticated using ((select private.can(%L)))',tbl,perm||'.read');
 if tbl not in ('audit_log','enrollment_events') then
 execute format('grant insert, update on public.%I to authenticated',tbl);
 execute format('create policy insert_access on public.%I for insert to authenticated with check ((select private.can(%L)))',tbl,perm||'.write');
 execute format('create policy update_access on public.%I for update to authenticated using ((select private.can(%L))) with check ((select private.can(%L)))',tbl,perm||'.write',perm||'.write');
 execute format('create trigger audit_changes after insert or update on public.%I for each row execute function private.record_change()',tbl);
 end if;
 end loop; end $$;
-- Personal templates stay within the current authorized user's account.
drop policy read_access on public.report_templates;
drop policy insert_access on public.report_templates;
drop policy update_access on public.report_templates;
create policy read_access on public.report_templates for select to authenticated using (owner=auth.uid() and (select private.can('reports.read')));
create policy insert_access on public.report_templates for insert to authenticated with check(owner=auth.uid() and (select private.can('reports.write')));
create policy update_access on public.report_templates for update to authenticated using(owner=auth.uid() and (select private.can('reports.write'))) with check(owner=auth.uid() and (select private.can('reports.write')));
-- Trigger checks run with locked group rows, so concurrent activation cannot overfill a group.
create function private.check_enrollment() returns trigger language plpgsql security definer set search_path='' as $$
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
revoke all on function private.check_enrollment() from public;
create trigger enforce_enrollment before insert or update on public.enrollments for each row execute function private.check_enrollment();
create function private.enrollment_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='INSERT' or new.status is distinct from old.status then insert into public.enrollment_events(enrollment_id,previous_status,new_status,actor) values(new.id,case when tg_op='UPDATE' then old.status else null end,new.status,auth.uid());end if;return new;end $$;
revoke all on function private.enrollment_event() from public;
create trigger enrollment_status after insert or update on public.enrollments for each row execute function private.enrollment_event();
-- This RPC is invoker: table RLS and status triggers always remain in force.
create function public.confirm_enrollments(enrollment_ids uuid[]) returns setof uuid language plpgsql security invoker set search_path='' as $$ declare target uuid;begin
 if not private.can('enrollments.confirm') then raise exception 'Acceso denegado';end if;
 if cardinality(enrollment_ids)>500 then raise exception 'Máximo 500 matrículas';end if;
 for target in select unnest(enrollment_ids) order by 1 loop
 update public.enrollments set status='Activo' where id=target and status='Inactivo';
 if not found then raise exception 'Matrícula no disponible';end if;
 return next target;
 end loop;end $$;
revoke all on function public.confirm_enrollments(uuid[]) from public;
grant execute on function public.confirm_enrollments(uuid[]) to authenticated;
-- Service-only lookup/rate gate. No client is allowed to enumerate account IDs.
create table private.login_attempts(identifier_hash text primary key,attempts integer not null,window_start timestamptz not null);
alter table private.login_attempts enable row level security;
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;
create function public.login_gate(identity_number text) returns table(email text,allowed boolean) language plpgsql security invoker set search_path='' as $$
declare count_attempts integer; begin
 insert into private.login_attempts values(md5(lower(identity_number)),1,now()) on conflict(identifier_hash) do update set attempts=case when private.login_attempts.window_start<now()-interval '15 minutes' then 1 else private.login_attempts.attempts+1 end,window_start=case when private.login_attempts.window_start<now()-interval '15 minutes' then now() else private.login_attempts.window_start end returning attempts into count_attempts;
 return query select a.auth_email,(count_attempts<=5 and a.active) from private.accounts a where lower(a.identification)=lower(identity_number);
 end $$;
revoke all on function public.login_gate(text) from public,anon,authenticated;
grant execute on function public.login_gate(text) to service_role;
create function public.account_password_changed(target uuid) returns void language sql security invoker set search_path='' as $$ update private.accounts set must_change_password=false where user_id=target and active $$;
revoke all on function public.account_password_changed(uuid) from public,anon,authenticated;
grant execute on function public.account_password_changed(uuid) to service_role;
create function public.provision_account(target uuid,identity_number text,email_address text,account_name text,rights text[]) returns void language sql security invoker set search_path='' as $$ insert into private.accounts(user_id,identification,auth_email,display_name,permissions) values(target,identity_number,email_address,account_name,rights) $$;
revoke all on function public.provision_account(uuid,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.provision_account(uuid,text,text,text,text[]) to service_role;
