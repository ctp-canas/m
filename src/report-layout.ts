import {groupKey, groupTitle, sectionKey, sectionLabel, sortName, type Group, type Row} from './domain';

export type Organization = 'unified' | 'separate';
type ReportBlock = {title:string; rows:Row[]};

export function hasReportGroups(rows:Row[], groups:Group[]) {
  const selected=new Set(rows.filter(r=>r.enrollment.section).map(r=>sectionKey(r.enrollment)));
  const memberships=new Map<string,Set<string>>();
  for(const e of [...groups,...rows.map(r=>r.enrollment)]){
    const key=sectionKey(e);
    if(!selected.has(key))continue;
    const members=memberships.get(key)??new Set<string>();
    members.add(groupKey(e));
    if(members.size>1)return true;
    memberships.set(key,members);
  }
  return false;
}

export const studentReportColumns = (columns:string[]) => columns.filter(key=>key!=='status');

export function reportLayout(rows:Row[], requested:string[], organization:Organization='unified', fallbackSection='') {
  const sections = new Map(rows.map(({enrollment:e}) => [sectionKey(e), sectionLabel(e)]));
  const section = sections.size === 1 ? [...sections.values()][0] : !sections.size ? fallbackSection : '';
  const columns = studentReportColumns(requested).filter(k => k !== 'group' || !section);
  if (sections.size > 1 && !columns.includes('group')) columns.splice(Math.min(2,columns.length),0,'group');
  const sorted = [...rows].sort(sortName);
  const blocks = new Map<string,ReportBlock>();
  if (organization === 'separate') {
    for (const row of sorted) {
      const e = row.enrollment;
      const key = `${sectionKey(e)}:${groupKey(e)}`;
      if (!blocks.has(key)) {
        blocks.set(key,{title:[!section && sectionLabel(e),groupTitle(e)].filter(Boolean).join(' · '),rows:[]});
      }
      blocks.get(key)!.rows.push(row);
    }
  }
  const lists = [...blocks.values()].sort((a,b) => a.title.localeCompare(b.title,'es',{numeric:true}));
  return {section, columns, blocks:lists.length ? lists : [{title:'',rows:sorted}]};
}
