import {age,normalize,sectionLabel,today,type Row,type State} from './domain';
import {genderLabel} from './gender-statistics';
import {compareLabels,initialFilters,scopedCapacity,scopedRecords,type Filters} from './statistics-scope';

const missing='No registrado';
export const categories={
  gender:{label:'Género',value:(r:Row)=>genderLabel(r.student.gender)},
  grade:{label:'Nivel académico',value:(r:Row)=>`${r.enrollment.grade}°`},
  section:{label:'Sección',value:(r:Row)=>sectionLabel(r.enrollment)},
  subgroup:{label:'Subgrupo',value:(r:Row)=>r.enrollment.subgroup||'No aplica'},
  specialty:{label:'Especialidad técnica',value:(r:Row)=>r.enrollment.specialty||'No aplica'},
  origin:{label:'Centro educativo de procedencia',value:(r:Row)=>r.student.previousSchool?.trim()||missing},
  condition:{label:'Condición académica',value:(r:Row)=>r.enrollment.condition||missing},
} as const;
export const measures={students:'Cantidad de estudiantes',age:'Edad',occupied:'Capacidad ocupada',available:'Cupos disponibles'} as const;
export const operations={
  count:'Conteo',percent:'Porcentaje',average:'Promedio',range:'Mínimo y máximo',
  distribution:'Distribución por categorías',comparison:'Comparación entre grupos',frequency:'Tabla de frecuencias',cross:'Tabla cruzada',
} as const;
export const chartTypes={
  table:'Tabla',bar:'Gráfico de barras',grouped:'Barras agrupadas',stacked:'Barras apiladas',
  pie:'Gráfico circular',donut:'Gráfico de dona',histogram:'Histograma',
} as const;
type Category=keyof typeof categories;
export type Variable=Category|keyof typeof measures;
type Operation=keyof typeof operations;
export type ChartType=keyof typeof chartTypes;
export type Analysis={year:number;filters:Filters;variable:Variable;operation:Operation;group:Category|'';visual:ChartType};
export type Matrix={label:string;values:number[]}[];
type Cell=string|number;
export type AnalysisResult={title:string;scope:string;population:number;summary:string;headers:string[];table:Cell[][];total?:Cell[];matrix:Matrix;series:string[];formats:ChartType[];unit:string};

export const defaultAnalysis=(year:number):Analysis=>({year,filters:initialFilters,variable:'students',operation:'count',group:'',visual:'table'});
export const categoryVariable=(v:Variable):v is Category=>Object.hasOwn(categories,v);
export const capacityVariable=(v:Variable)=>v==='occupied'||v==='available';
export const variableLabel=(v:Variable)=>categoryVariable(v)?categories[v].label:measures[v];
export const operationsFor=(variable:Variable):Operation[]=>
  variable==='age'?['average','range','frequency','comparison']:
  capacityVariable(variable)?['count','average','range','comparison']:
  variable==='students'?['count','percent','distribution','comparison','frequency']:
  ['count','percent','distribution','comparison','frequency','cross'];

export const needsActive=(a:Analysis)=>a.variable==='gender'||a.group==='gender'||capacityVariable(a.variable);
export const needsGroup=(a:Analysis)=>a.operation==='cross'||(a.operation==='comparison'&&!capacityVariable(a.variable)&&!categoryVariable(a.variable));
export function groupsFor(a:Analysis):Category[]{
  if(capacityVariable(a.variable))return [];
  if(categoryVariable(a.variable)&&a.operation!=='cross')return [];
  if(a.operation==='cross'&&a.variable==='students')return [];
  if(a.variable==='age'&&a.operation==='frequency')return [];
  return (Object.keys(categories) as Category[]).filter(key=>key!==a.variable);
}

function categoryValue(row:Row,key:Category){return categories[key].value(row)}
const labelKey=(label:string)=>normalize(label).replace(/\s+/g,' ');
const round=(value:number)=>Math.round(value*100)/100;
const percent=(value:number,total:number)=>total?round(100*value/total):0;
const compareRows=(a:{label:string},b:{label:string})=>compareLabels(a.label,b.label);
const display=(value:number)=>value.toLocaleString('es-CR',{maximumFractionDigits:2});
const ageAt=(birthdate:string,reference:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birthdate))return null;
  const date=new Date(birthdate+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==birthdate)return null;
  const n=age(birthdate,reference);
  return n!==null&&n>=0&&n<=120?n:null;
};
function formatsFor(matrix:Matrix,series:string[],op:Operation,variable:Variable):ChartType[]{
  if(!matrix.length||matrix.length>36||series.length>8)return ['table'];
  if(variable==='age'&&op==='frequency')return ['histogram','table'];
  if(series.length>1)return op==='range'?['grouped','table']:['grouped','stacked','table'];
  if(!matrix.some(row=>row.values.some(Boolean)))return ['table'];
  const formats:ChartType[]=matrix.length===1?['table','bar']:['bar','table'];
  if(matrix.length>1&&matrix.length<=8&&['count','percent','distribution','frequency'].includes(op)&&!capacityVariable(variable)){
    formats.push('pie','donut');
  }
  return formats;
}

export function analyze(records:Row[],db:State,analysis:Analysis,reference=today()):AnalysisResult {
  const {year,variable,operation}=analysis;
  if(!operationsFor(variable).includes(operation))throw Error('La operación elegida no corresponde a la variable.');
  if(analysis.group&&!groupsFor(analysis).includes(analysis.group))throw Error('Seleccione una variable de agrupación compatible.');
  if(operation==='cross'&&!categoryVariable(variable))throw Error('Una tabla cruzada requiere dos variables categóricas.');
  if(needsGroup(analysis)&&!analysis.group)throw Error('Seleccione una variable para comparar los grupos.');
  const filters={...analysis.filters,status:needsActive(analysis)?'Activo':analysis.filters.status};
  const scoped=scopedRecords(records,year,filters);
  const scope=[
    `Curso ${year}`,filters.grade?`Nivel ${filters.grade}°`:'Todos los niveles',
    filters.section?`Sección ${filters.section}`:'Todas las secciones',filters.subgroup&&`Subgrupo ${filters.subgroup}`,
    filters.specialty,filters.status==='Activo'?'Matrícula activa':filters.status?`Estado: ${filters.status}`:'Todos los estados',
  ].filter(Boolean).join(' · ');
  const label=variableLabel(variable);
  const title=`${operations[operation]} · ${label}${analysis.group?` por ${categories[analysis.group].label.toLowerCase()}`:''}`;
  const groups=new Map<string,{label:string;values:number[]}>();
  const add=(name:string,value:number)=>{
    const key=labelKey(name);
    const bucket=groups.get(key)??{label:name,values:[]};
    bucket.values.push(value);groups.set(key,bucket);
  };
  const count=scoped.length;
  let headers:string[],table:Cell[][],matrix:Matrix,series:string[],unit:string,summary:string,total:Cell[]|undefined;
  if(operation==='cross'){
    const rowLabels=new Map<string,string>(),columnLabels=new Map<string,string>(),counts=new Map<string,Map<string,number>>();
    const rowKey=variable as Category, colKey=analysis.group as Category;
    for(const row of scoped){
      const a=categoryValue(row,rowKey),b=categoryValue(row,colKey),x=labelKey(a),y=labelKey(b);
      if(!rowLabels.has(x))rowLabels.set(x,a);
      if(!columnLabels.has(y))columnLabels.set(y,b);
      const bucket=counts.get(x)??new Map<string,number>();
      bucket.set(y,(bucket.get(y)??0)+1);counts.set(x,bucket);
    }
    const columns=[...columnLabels.entries()].sort((a,b)=>compareLabels(a[1],b[1]));
    series=columns.map(([,value])=>value);unit='Estudiantes';
    matrix=[...rowLabels.entries()].map(([key,text])=>({label:text,values:columns.map(([col])=>counts.get(key)?.get(col)??0)})).sort(compareRows);
    headers=[label,...series,'Total'];
    table=matrix.map(row=>[row.label,...row.values,row.values.reduce((a,b)=>a+b,0)]);
    total=['Total',...columns.map((_,i)=>matrix.reduce((n,row)=>n+row.values[i],0)),count];
    summary=`${count} estudiantes únicos · ${matrix.length} categorías de fila · ${columns.length} categorías de columna.`;
  }else if(variable==='age'&&operation==='frequency'){
    const valid=scoped.map(r=>ageAt(r.student.birthdate,reference)).filter((n):n is number=>n!==null);
    const bins=new Map<number,number>();
    if(valid.length){
      const first=Math.floor(Math.min(...valid)/2)*2,last=Math.floor(Math.max(...valid)/2)*2;
      for(let lower=first;lower<=last;lower+=2)bins.set(lower,0);
      for(const n of valid){const lower=Math.floor(n/2)*2;bins.set(lower,bins.get(lower)!+1)}
    }
    matrix=[...bins].map(([lower,n])=>({label:`${lower}–${lower+1}`,values:[n]}));
    headers=['Edad en años','Estudiantes','Porcentaje'];series=['Estudiantes'];unit='Estudiantes';
    table=matrix.map(({label,values:[n]})=>[label,n,`${display(percent(n,valid.length))} %`]);
    total=['Total',valid.length,valid.length?'100 %':'0 %'];
    summary=`${valid.length} edades válidas de ${count} estudiantes. Intervalos de dos años · Fecha de referencia: ${reference}.`;
  }else if(variable==='age'||capacityVariable(variable)){
    const capacity=capacityVariable(variable);
    if(capacity){
      for(const section of scopedCapacity(records,db.groups,year,filters)){
        add(operation==='comparison'?section.name:'Secciones seleccionadas',variable==='occupied'?section.value:section.available);
      }
    }else{
      for(const row of scoped){
        const n=ageAt(row.student.birthdate,reference);
        if(n!==null)add(analysis.group?categoryValue(row,analysis.group):'Población seleccionada',n);
      }
    }
    const sample=[...groups.values()].flatMap(group=>group.values);
    const measure=(values:number[])=>operation==='range'?[Math.min(...values),Math.max(...values)]:
      [round(values.reduce((a,b)=>a+b,0)/(operation==='average'||(operation==='comparison'&&!capacity)?values.length:1))];
    series=operation==='range'?['Mínimo','Máximo']:[operation==='average'||(operation==='comparison'&&!capacity)?'Promedio':'Total'];
    unit=capacity?'Cupos':'Años';
    matrix=[...groups.values()].sort(compareRows).map(group=>({label:group.label,values:measure(group.values)}));
    headers=[analysis.group?categories[analysis.group].label:capacity?'Sección o conjunto':'Población',capacity?'Secciones':'Edades válidas',...series.map(text=>`${text} (${unit.toLowerCase()})`)];
    table=matrix.map(row=>[row.label,groups.get(labelKey(row.label))!.values.length,...row.values]);
    if(sample.length)total=['Resultado general',sample.length,...measure(sample)];
    summary=capacity?`${sample.length} secciones. Se considera la ocupación completa de cada sección incluida.`:
      `${sample.length} edades válidas de ${count} estudiantes · Fecha de referencia: ${reference}.`;
  }else{
    const key=categoryVariable(variable)?variable:analysis.group;
    for(const row of scoped)add(key?categoryValue(row,key):'Población seleccionada',1);
    const usePercent=operation==='percent'||operation==='distribution';
    headers=[key?categories[key].label:'Población','Estudiantes','Porcentaje'];series=[usePercent?'Porcentaje':'Estudiantes'];
    unit=usePercent?'Porcentaje':'Estudiantes';
    const buckets=[...groups.values()].sort(compareRows);
    matrix=buckets.map(row=>({label:row.label,values:[usePercent?percent(row.values.length,count):row.values.length]}));
    table=buckets.map(row=>[row.label,row.values.length,`${display(percent(row.values.length,count))} %`]);
    total=['Total',count,count?'100 %':'0 %'];
    summary=`${count} estudiantes únicos. El porcentaje se calcula sobre la población seleccionada.`;
  }
  return {title,scope,population:count,summary,headers,table,total,matrix,series,formats:formatsFor(matrix,series,operation,variable),unit};
}
