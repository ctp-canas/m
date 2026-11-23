-- Add print assets and transfer snapshots without deleting or changing enrollment records.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('report-artwork','report-artwork',false,2097152,array['image/png','image/jpeg'])
on conflict(id) do nothing;

create table public.report_artwork (
  slot text primary key check(slot in ('header','footer')),
  mode text not null default 'default' check(mode in ('default','hidden','custom')),
  object_path text,
  revision integer not null default 0,
  check ((mode='custom') = (object_path is not null)),
  check (object_path is null or object_path ~ ('^'||slot||'/[a-f0-9-]{36}\.(png|jpg)$'))
);
insert into public.report_artwork(slot) values ('header'),('footer');
alter table public.report_artwork enable row level security;
revoke all on public.report_artwork from public,anon,authenticated;
grant select on public.report_artwork to authenticated;
grant update (mode,object_path) on public.report_artwork to authenticated;
create policy read_report_artwork on public.report_artwork for select to authenticated using (
  (select private.can('students.read') or private.can('reports.read') or private.can('configuration.write'))
);
create policy manage_report_artwork on public.report_artwork for update to authenticated
using ((select private.can('configuration.write')))
with check ((select private.can('configuration.write')));

create policy read_report_artwork_files on storage.objects for select to authenticated using (
  bucket_id='report-artwork' and (
    (select private.can('configuration.write')) or exists (
      select 1 from public.report_artwork a where a.object_path=storage.objects.name
    )
  )
);
create policy upload_report_artwork_files on storage.objects for insert to authenticated with check (
  bucket_id='report-artwork' and (select private.can('configuration.write'))
  and name ~ '^(header|footer)/[a-f0-9-]{36}\.(png|jpg)$'
);
-- Object keys are immutable. Switching or hiding an image changes only the referenced key.

create function private.validate_report_artwork() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.mode='custom' and not exists (
    select 1 from storage.objects where bucket_id='report-artwork' and name=new.object_path
  ) then raise exception 'La imagen institucional seleccionada no está disponible'; end if;
  new.revision:=old.revision+1;
  return new;
end $$;
revoke all on function private.validate_report_artwork() from public,anon,authenticated;
create trigger validate_report_artwork before update on public.report_artwork
for each row execute function private.validate_report_artwork();

alter table public.enrollment_events
  add column transfer_date date,
  add column transfer_grade smallint check(transfer_grade between 7 and 12),
  add column transfer_section smallint check(transfer_section between 1 and 4),
  add column transfer_name text,
  add column transfer_identification text,
  add constraint enrollment_event_transfer_only check (
    new_status='Traslado' or (transfer_date is null and transfer_grade is null and transfer_section is null
      and transfer_name is null and transfer_identification is null)
  );

-- Backfill only the latest unambiguous transfer whose enrollment still stores its effective date.
-- The prior event timestamp is a registration timestamp, never an effective transfer date.
update public.enrollment_events ev
set transfer_date=e.effective_date,
    transfer_grade=case when ev.effective_at=e.updated_at then e.group_grade end,
    transfer_section=case when ev.effective_at=e.updated_at then e.group_section end,
    transfer_name=concat_ws(' ',s.name,s.surname1,nullif(s.surname2,'')),
    transfer_identification=s.identification
from public.enrollments e join public.students s on s.id=e.student_id
where ev.enrollment_id=e.id and ev.new_status='Traslado' and e.status='Traslado'
  and e.effective_date is not null
  and not exists (
    select 1 from public.enrollment_events other where other.enrollment_id=e.id
      and other.id<>ev.id and other.effective_at>=ev.effective_at
  );

-- Extend the existing trigger. A date correction to the current transfer does not create another event.
create or replace function private.enrollment_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.enrollment_events(
      enrollment_id,previous_status,new_status,actor,effective_at,
      transfer_date,transfer_grade,transfer_section,transfer_name,transfer_identification
    )
    select new.id,case when tg_op='UPDATE' then old.status else null end,new.status,auth.uid(),clock_timestamp(),
      case when new.status='Traslado' then new.effective_date end,
      case when new.status='Traslado' then new.group_grade end,
      case when new.status='Traslado' then new.group_section end,
      case when new.status='Traslado' then concat_ws(' ',s.name,s.surname1,nullif(s.surname2,'')) end,
      case when new.status='Traslado' then s.identification end
    from public.students s where s.id=new.student_id;
  elsif new.status='Traslado' and new.effective_date is distinct from old.effective_date then
    update public.enrollment_events current_event
    set transfer_date=new.effective_date,
        transfer_name=coalesce(current_event.transfer_name,concat_ws(' ',s.name,s.surname1,nullif(s.surname2,''))),
        transfer_identification=coalesce(current_event.transfer_identification,s.identification)
    from public.students s where s.id=new.student_id and current_event.id=(select ev.id from public.enrollment_events ev
      where ev.enrollment_id=new.id and ev.new_status='Traslado'
      order by ev.effective_at desc,ev.id desc limit 1);
  end if;
  return new;
end $$;

create index report_transfer_date on public.enrollment_events(transfer_date,enrollment_id)
where new_status='Traslado' and transfer_date is not null;

create view public.report_transfers with (security_invoker=true) as
select ev.id,ev.enrollment_id,e.year,ev.transfer_date,ev.transfer_grade,ev.transfer_section,
       ev.transfer_name,ev.transfer_identification
from public.enrollment_events ev join public.enrollments e on e.id=ev.enrollment_id
where ev.new_status='Traslado' and ev.transfer_date is not null and (select private.can('reports.read'));
revoke all on public.report_transfers from public,anon,authenticated;
grant select on public.report_transfers to authenticated;

create function public.report_permissions() returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'artwork', private.can('configuration.write') or private.can('students.read') or private.can('reports.read'),
    'editArtwork', private.can('configuration.write'),
    'transfers', private.can('students.read') and private.can('reports.read')
  )
$$;
revoke all on function public.report_permissions() from public,anon,authenticated;
grant execute on function public.report_permissions() to authenticated;

commit;
