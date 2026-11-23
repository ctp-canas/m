import {sectionKey,sectionLabel,SECTION_CAPACITY,type Group,type Row} from './domain';

export const statuses=['Activo','Inactivo','Traslado','Retiro de matrícula'] as const;
export type Filters={grade:string;section:string;specialty:string;status:string;subgroup?:string};
export const initialFilters:Filters={grade:'',section:'',specialty:'',status:'Activo'};
type Academic=Pick<Group,'grade'|'section'|'subgroup'|'specialty'>;
export const matchesAcademic=(entry:Academic,filters:Filters)=>
  (!filters.grade||entry.grade===Number(filters.grade))
  &&(!filters.section||sectionLabel(entry)===filters.section)
  &&(!filters.specialty||entry.specialty===filters.specialty)
  &&(!filters.subgroup||entry.subgroup===filters.subgroup);

export function scopedRecords(records:Row[],year:number,filters:Filters){
  const unique=new Map<string,Row>();
  for(const row of records){
    const e=row.enrollment;
    if(e.year!==year||!matchesAcademic(e,filters)||(filters.status&&e.status!==filters.status))continue;
    const existing=unique.get(row.student.id);
    if(!existing||(existing.enrollment.status!=='Activo'&&e.status==='Activo'))unique.set(row.student.id,row);
  }
  return [...unique.values()];
}
export const compareLabels=(a:string,b:string)=>a.localeCompare(b,'es-CR',{numeric:true});
export const ordered=(values:Iterable<string>)=>[...new Set(values)].filter(Boolean).sort(compareLabels);


export function scopedCapacity(records:Row[],groups:Group[],year:number,filters:Filters){
  const sections=new Map(groups.filter(g=>g.year===year&&matchesAcademic(g,filters)).map(g=>[sectionKey(g),g]));
  const used=new Map<string,number>();
  for(const {enrollment:e} of scopedRecords(records,year,initialFilters)){
    const key=sectionKey(e);
    used.set(key,(used.get(key)??0)+1);
  }
  return [...sections.entries()].map(([key,section])=>{
    const value=used.get(key)??0;
    return {name:sectionLabel(section),value,available:Math.max(0,SECTION_CAPACITY-value)};
  });
}
