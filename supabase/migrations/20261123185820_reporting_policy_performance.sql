begin;
alter policy read_access on public.report_templates using (owner=(select auth.uid()) and (select private.can('reports.read')));
alter policy insert_access on public.report_templates with check (owner=(select auth.uid()) and (select private.can('reports.write')));
alter policy update_access on public.report_templates using (owner=(select auth.uid()) and (select private.can('reports.write')))
with check (owner=(select auth.uid()) and (select private.can('reports.write')));
create index if not exists academic_groups_specialty on public.academic_groups(specialty_id);
create index if not exists enrollments_assignment_reference on public.enrollments(group_id,year,group_grade,group_section);
commit;
