import {normalize,sectionKey,sectionLabel,type Row,type Group} from './domain';

export const genderCategories=[
  {key:'male',label:'Masculino',color:'#3d6696'},
  {key:'female',label:'Femenino',color:'#087a71'},
  {key:'other',label:'Otro',color:'#805494'},
  {key:'unspecified',label:'No especificado',color:'#ac7723'},
] as const;
type GenderKey=typeof genderCategories[number]['key'];
type GenderCount=Record<GenderKey,number>&{total:number};
export type GenderSection=GenderCount&{name:string};

const emptyCounts=():GenderCount=>({male:0,female:0,other:0,unspecified:0,total:0});

export function genderLabel(value?:string){
  const recorded=normalize(value??'');
  return genderCategories.find(category=>category.key!=='unspecified'&&normalize(category.label)===recorded)?.label??'No especificado';
}

export function genderBySection(scoped:Row[],configured:Group[]){
  const sections=new Map<string,GenderSection>();
  const ensure=(group:Pick<Group,'year'|'grade'|'section'>)=>{
    const key=sectionKey(group);
    const current=sections.get(key);
    if(current)return current;
    const counts={name:sectionLabel(group),...emptyCounts()};
    sections.set(key,counts);
    return counts;
  };
  configured.forEach(ensure);
  const totals=emptyCounts();
  for(const {student,enrollment} of scoped){
    if(enrollment.status!=='Activo')continue;
    const section=ensure(enrollment);
    const gender=genderCategories.find(category=>category.label===genderLabel(student.gender))!.key;
    section[gender]++;
    section.total++;
    totals[gender]++;
    totals.total++;
  }
  return {sections:[...sections.values()],totals};
}
