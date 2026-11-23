import {useState} from 'react';
import {Download,Printer} from 'lucide-react';
import {sectionLabel,sortName,type Row,type State} from './domain';
import {reportColumnLabel,reportValue,type ReportOptions} from './reports';
import {reportLayout} from './report-layout';

export const originTitle='Estudiantes de sétimo año por centro educativo de procedencia';
export const originColumns=['identification','name','group','previousSchool'];

export function seventhGradeRows(records:Row[],year:number,section:string){
  const seen=new Set<string>();
  return [...records].sort(sortName).filter(({student,enrollment:e})=>{
    if(e.year!==year||e.grade!==7||e.status!=='Activo'||(section&&sectionLabel(e)!==section)||seen.has(student.id))return false;
    seen.add(student.id);return true;
  });
}

export function OriginReport({records,db,year,setYear,onExport}:{
  records:Row[];db:State;year:number;setYear:(year:number)=>void;
  onExport:(pdf:boolean,rows:Row[],columns:string[],title:string,options:ReportOptions,askOrganization:boolean)=>Promise<void>;
}){
  const [selected,setSelected]=useState('');
  const sections=[...new Set([
    ...db.groups.filter(g=>g.year===year&&g.grade===7&&g.section).map(sectionLabel),
    ...records.filter(r=>r.enrollment.grade===7&&r.enrollment.section).map(r=>sectionLabel(r.enrollment)),
  ])].sort((a,b)=>a.localeCompare(b,'es-CR',{numeric:true}));
  const section=sections.includes(selected)?selected:'';
  const scoped=seventhGradeRows(records,year,section);
  const layout=reportLayout(scoped,originColumns,'unified',section);
  const options={section,filters:'Sétimo año · Matrícula activa',cedula:true,landscape:false};
  const generate=(pdf:boolean)=>onExport(pdf,scoped,originColumns,originTitle,options,false);
  return <section className="card origin-report">
    <div className="card-heading"><div><h3>{originTitle}</h3>
      <p>Curso lectivo {year} · {layout.section?`Sección ${layout.section}`:'Todas las secciones de sétimo'} · {scoped.length} estudiantes activos</p>
    </div></div>
    <div className="report-config">
      <div className="form-grid">
        <label className="field"><span>Curso lectivo del informe</span><select value={year} onChange={e=>{setSelected('');setYear(Number(e.target.value))}}>{db.years.map(entry=><option key={entry.year}>{entry.year}</option>)}</select></label>
        <label className="field"><span>Sección de sétimo</span><select value={section} onChange={e=>setSelected(e.target.value)}><option value="">Todas las secciones de sétimo</option>{sections.map(label=><option key={label}>{label}</option>)}</select></label>
      </div>
      <div className="report-export flex">
        <button className="button secondary" onClick={()=>void generate(false)}><Download size={16}/>Descargar Excel</button>
        <button className="button primary" onClick={()=>void generate(true)}><Printer size={16}/>Vista previa e impresión PDF</button>
      </div>
    </div>
    <div className="table-wrap"><table aria-label={originTitle}><thead><tr>{layout.columns.map(col=><th scope="col" key={col}>{reportColumnLabel(col,options)}</th>)}</tr></thead>
      <tbody>{scoped.map(row=><tr key={row.student.id}>{layout.columns.map(col=><td key={col}>{reportValue(row,col)}</td>)}</tr>)}</tbody></table></div>
    {!scoped.length&&<p className="statistics-empty">No se encontraron estudiantes activos para la selección.</p>}
  </section>;
}
