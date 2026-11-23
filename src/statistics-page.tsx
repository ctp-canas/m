import {useState} from 'react';
import {BarChart3,Building2,ChartNoAxesCombined,Download,GraduationCap,LayoutDashboard,Layers,SlidersHorizontal,Users} from 'lucide-react';
import {Bar,BarChart,CartesianGrid,Cell,Legend,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {sectionKey,sectionLabel,SECTION_CAPACITY,type Row,type State} from './domain';
import {downloadSheet} from './sheets';
import {genderBySection,genderLabel} from './gender-statistics';
import {GenderStatisticsPanel,genderTableHeader,genderTableValues,genderTitle} from './gender-statistics-panel';

import {initialFilters,matchesAcademic,ordered,scopedCapacity,scopedRecords,statuses,type Filters} from './statistics-scope';
import {CustomStatisticsBuilder,StatSelect} from './custom-statistics-builder';

const colors=['#087a71','#ac7723','#3d6696','#805494'];
type Entry={name:string; value:number; available?:number};
type Series={title:string; entries:Entry[]; kind?:'pie'|'capacity'; caption?:string};
export function scopedGenderStatistics(records:Row[],db:State,year:number,filters:Filters){
  return genderBySection(
    scopedRecords(records,year,{...filters,status:'Activo'}),
    db.groups.filter(group=>group.year===year&&matchesAcademic(group,filters)),
  );
}

export function statisticsSeries(records:Row[],db:State,year:number,filters:Filters):Series[] {
  const scoped=scopedRecords(records,year,filters);
  const sectionGroups=db.groups.filter(g=>g.year===year&&matchesAcademic(g,filters));
  const uniqueSections=[...new Map(sectionGroups.map(g=>[sectionKey(g),g])).values()];
  const counts=(key:(row:Row)=>string,initial:string[]=[],source=scoped):Entry[]=>{
    const result=new Map(initial.map(name=>[name,0]));
    for(const row of source){
      const name=key(row);
      result.set(name,(result.get(name)??0)+1);
    }
    return [...result].map(([name,value])=>({name,value}));
  };
  return [
    {title:'Estudiantes por nivel',entries:counts(r=>`${r.enrollment.grade}°`,[7,8,9,10,11,12].filter(g=>!filters.grade||g===+filters.grade).map(g=>`${g}°`))},
    {title:'Matrícula por sección',entries:counts(r=>sectionLabel(r.enrollment),uniqueSections.map(sectionLabel))},
    {title:'Estado de matrícula',kind:'pie',entries:counts(r=>r.enrollment.status,[...statuses])},
    {title:'Distribución por especialidad',entries:counts(r=>r.enrollment.specialty||'Sin especialidad',filters.specialty?[filters.specialty]:[...new Set(sectionGroups.map(g=>g.specialty).filter(Boolean))])},
    {title:'Distribución por género',kind:'pie',caption:'Solo estudiantes activos.',entries:counts(r=>genderLabel(r.student.gender),['Femenino','Masculino','Otro','No especificado'],scopedRecords(records,year,{...filters,status:'Activo'}))},
    {title:'Educación Religiosa',entries:counts(r=>r.enrollment.religion?'Sí':'No',['Sí','No'])},
    {title:'Comparación entre cursos lectivos',caption:'Solo matrículas activas. Un estudiante puede figurar en más de un curso.',entries:db.years.map(y=>({
      name:String(y.year),
      value:new Set(db.enrollments.filter(e=>e.year===y.year&&e.status==='Activo'&&matchesAcademic(e,filters)).map(e=>e.studentId)).size,
    }))},
        {title:'Cupo por sección',kind:'capacity',caption:'Ocupación real por sección. Incluye todos sus estudiantes activos.',entries:scopedCapacity(records,db.groups,year,filters)},
  ];
}
export function StatisticsPage({records,db,year,setYear,toast,exportRecords}:{records:Row[];db:State;year:number;setYear:(year:number)=>void;toast:(message:string)=>void;exportRecords:(records:Row[])=>void}){
  const [area,setArea]=useState<'summary'|'detail'|'custom'>('summary');
  const [view,setView]=useState<'table'|'chart'>('table');
  const [stacked,setStacked]=useState(false);
  const [filters,setFilters]=useState<Filters>(initialFilters);
  const [sort,setSort]=useState('name');
  const groups=db.groups.filter(g=>g.year===year&&(!filters.grade||g.grade===+filters.grade));
  const available=[...groups,...records.filter(r=>!filters.grade||r.enrollment.grade===+filters.grade).map(r=>r.enrollment)];
  const sections=ordered(available.filter(g=>g.section).map(sectionLabel));
  const specialties=ordered(available.filter(g=>!filters.section||sectionLabel(g)===filters.section).map(g=>g.specialty));
  const effective={...filters,section:sections.includes(filters.section)?filters.section:'',specialty:specialties.includes(filters.specialty)?filters.specialty:''};
  const data=statisticsSeries(records,db,year,effective).map(s=>({...s,entries:s.entries.sort((a,b)=>
    (sort==='amount'?b.value-a.value:0)||a.name.localeCompare(b.name,'es',{numeric:true})
  )}));
  const gender=scopedGenderStatistics(records,db,year,effective);
  gender.sections.sort((a,b)=>(sort==='amount'?b.total-a.total:0)||a.name.localeCompare(b.name,'es',{numeric:true}));
  const update=(key:keyof Filters,value:string)=>setFilters(prev=>({...prev,[key]:value,...(key==='grade'?{section:'',specialty:''}:key==='section'?{specialty:''}:{})}));
  const total=data[2].entries.reduce((sum,e)=>sum+e.value,0);
  const overview=statisticsSeries(records,db,year,{...effective,status:'Activo'});
  const exportData=async()=>{
    try {
      const sheet:(string|number)[][]=[[`Estadísticas de matrícula · ${year} · DATOS FICTICIOS`],
        [`Nivel: ${effective.grade||'Todos'} · Sección: ${effective.section||'Todas'} · Especialidad: ${effective.specialty||'Todas'} · Estado: ${effective.status||'Todos'}`]];
      const headings:number[]=[];
      for(const series of data){
        sheet.push([],[series.caption?`${series.title} · ${series.caption}`:series.title],[...tableHead(series)]);
        headings.push(sheet.length);
        sheet.push(...series.entries.map(e=>tableValues(e,series)));
        if(series.title!=='Comparación entre cursos lectivos')sheet.push(['Total',...totals(series)]);
      }
      sheet.push([],[genderTitle],['Solo estudiantes activos'],genderTableHeader);
      headings.push(sheet.length);
      sheet.push(...gender.sections.map(section=>[section.name,...genderTableValues(section)]));
      sheet.push(['Total',...genderTableValues(gender.totals)]);
      await downloadSheet(sheet,`CTP_Canas_${year}_Estadisticas.xlsx`,'Estadísticas',{headings,widths:[40,22,22,22,22,22]});
      toast('Estadísticas exportadas.');
    } catch (err) {toast((err as Error).message)}
  };
  return <div className="statistics-page">
    <section className="stats-hero">
      <div><p className="stats-kicker">Gestión institucional · Curso lectivo {year}</p><h2>Análisis de matrícula</h2>
        <p>Consulte la matrícula activa, revise los cupos y compare grupos del CTP Cañas.</p></div>
      <span className="stats-hero-icon" aria-hidden="true"><ChartNoAxesCombined size={34}/></span>
    </section>
    <div className="stats-nav" role="group" aria-label="Áreas de estadísticas">
      <button className={area==='summary'?'selected':''} aria-pressed={area==='summary'} onClick={()=>setArea('summary')}><LayoutDashboard size={18}/>Resumen general</button>
      <button className={area==='detail'?'selected':''} aria-pressed={area==='detail'} onClick={()=>setArea('detail')}><BarChart3 size={18}/>Estadísticas detalladas</button>
      <button className={area==='custom'?'selected':''} aria-pressed={area==='custom'} onClick={()=>setArea('custom')}><SlidersHorizontal size={18}/>Estadísticas personalizadas</button>
    </div>
    {area==='custom'?<CustomStatisticsBuilder db={db} year={year} toast={toast}/>:<>
      <section className="card stats-filters">
        <div className="card-heading"><div><h3>Filtros de consulta</h3><p>{area==='summary'?'El resumen usa únicamente matrícula activa.':`${total} estudiantes en el alcance seleccionado. Los indicadores de género usan solo matrícula activa.`}</p></div></div>
        <div className="statistics-config">
          <div className="form-grid three">
            <StatSelect label="Curso lectivo de estadísticas" value={year} change={value=>{setYear(Number(value));setFilters(old=>({...old,section:'',specialty:''}))}}
              options={db.years.map(entry=>[String(entry.year),String(entry.year)])}/>
            <Select label="Nivel académico" value={filters.grade} onChange={value=>update('grade',value)} options={['7','8','9','10','11','12']} empty="Todos los niveles"/>
            <Select label="Sección" value={effective.section} onChange={value=>update('section',value)} options={sections} empty="Todas las secciones"/>
            <Select label="Especialidad técnica" value={effective.specialty} onChange={value=>update('specialty',value)} options={specialties} empty="Todas las especialidades"/>
            {area==='detail'&&<>
              <Select label="Estado de matrícula" value={filters.status} onChange={value=>update('status',value)} options={[...statuses]} empty="Todos los estados"/>
              <label className="field"><span>Orden</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Por nombre</option><option value="amount">Mayor cantidad primero</option></select></label>
            </>}
          </div>
          {area==='detail'&&<div className="statistics-actions">
            <div className="tabs" role="group" aria-label="Vista de estadísticas">
              <button className={view==='table'?'selected':''} aria-pressed={view==='table'} onClick={()=>setView('table')}>Vista de tabla</button>
              <button className={view==='chart'?'selected':''} aria-pressed={view==='chart'} onClick={()=>setView('chart')}>Vista de gráficos</button>
            </div>
            <div className="flex statistics-exports">
              <button className="button secondary" onClick={()=>exportRecords(scopedRecords(records,year,effective))}>Exportar detalle</button>
              <button className="button secondary" onClick={()=>void exportData()}><Download size={15}/>Descargar Excel</button>
            </div>
          </div>}
        </div>
      </section>
      {area==='summary'?<StatisticsOverview series={overview} gender={gender} onDetail={()=>setArea('detail')}/>:<>
        {!total&&<p className="card statistics-empty">No hay matrículas para los filtros seleccionados. Los cupos siguen reflejando la ocupación real de las secciones.</p>}
        <GenderStatisticsPanel data={gender} view={view} stacked={stacked} setStacked={setStacked}/>
        <div className="statistics-panels">{data.map(series=><section className={`card statistics-panel ${series.kind==='capacity'?'statistics-wide':''}`} key={series.title}>
          <div className="card-heading"><div><h3>{series.title}</h3>{series.caption&&<p>{series.caption}</p>}</div></div>
          {view==='table'?<div className="table-wrap"><table aria-label={series.title}>
            <thead><tr>{tableHead(series).map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{series.entries.map(entry=><tr key={entry.name}>{tableValues(entry,series).map((value,i)=>i===0?<th scope="row" key={i}>{value}</th>:<td key={i}>{value}</td>)}</tr>)}</tbody>
            {series.title!=='Comparación entre cursos lectivos'&&<tfoot><tr><th scope="row">Total</th>{totals(series).map((value,i)=><td key={i}>{value}</td>)}</tr></tfoot>}
          </table></div>:<SeriesChart series={series}/>}
        </section>)}</div>
      </>}
    </>}
  </div>;
}

function StatisticsOverview({series,gender,onDetail}:{series:Series[];gender:ReturnType<typeof scopedGenderStatistics>;onDetail:()=>void}){
  const total=gender.totals.total;
  const capacity=series.find(s=>s.kind==='capacity')!;
  const [occupied,available,limit]=totals(capacity);
  const percent=limit?occupied/limit*100:0;
  const format=(n:number)=>n.toLocaleString('es-CR',{maximumFractionDigits:1});
  const lead=(title:string,exclude='')=>series.find(s=>s.title===title)!.entries
    .filter(entry=>entry.name!==exclude&&entry.value>0).sort((a,b)=>b.value-a.value)[0];
  const leader=(entry:Entry|undefined)=>entry?`${entry.name} · ${format(entry.value)} estudiantes`:'Sin registros en el alcance';
  const level=lead('Estudiantes por nivel'),section=lead('Matrícula por sección'),specialty=lead('Distribución por especialidad','Sin especialidad');
  const technical=series.find(s=>s.title==='Distribución por especialidad')!.entries
    .filter(entry=>entry.name!=='Sin especialidad').reduce((sum,entry)=>sum+entry.value,0);
  const kpis=[
    {label:'Estudiantes activos',value:format(total),detail:'Matrículas únicas del curso y filtros seleccionados',icon:Users},
    {label:'Capacidad utilizada',value:limit?`${format(percent)} %`:'—',detail:`${format(occupied)} activos de ${format(limit)} cupos · Cupo total de las secciones`,icon:Layers},
    {label:'Cupos disponibles',value:format(available),detail:`${capacity.entries.length} secciones consideradas`,icon:Building2},
    {label:'Matrícula por nivel',value:level?.name??'—',detail:level?`Nivel con más estudiantes · ${level.value}`:leader(level),icon:GraduationCap},
    {label:'Matrícula por sección',value:section?.name??'—',detail:section?`Sección con más estudiantes · ${section.value}`:leader(section),icon:LayoutDashboard},
    {label:'Distribución por género',value:format(total),detail:`${gender.totals.female} femenino · ${gender.totals.male} masculino · ${gender.totals.other} otro · ${gender.totals.unspecified} sin especificar`,icon:Users},
    {label:'Especialidades técnicas',value:format(technical),detail:leader(specialty),icon:GraduationCap},
  ];
  return <section aria-label="Resumen general de estadísticas" className="stats-overview">
    <div className="stats-overview-heading"><div><h3>Resumen general</h3><p>Indicadores del alcance seleccionado</p></div>
      <button className="button secondary" onClick={onDetail}>Ver estadísticas detalladas</button></div>
    {!total&&<p className="card statistics-empty">No hay estudiantes activos para los filtros seleccionados.</p>}
    <div className="stats-kpis">{kpis.map(({label,value,detail,icon:Icon},index)=><article className="card stats-kpi" key={label}>
      <div><span>{label}</span><span className={`icon-tile ${index===1||index===2?'gold':'teal'}`} aria-hidden="true"><Icon size={18}/></span></div>
      <strong>{value}</strong><p>{detail}</p>
      {index===1&&limit>0&&<progress max={100} value={Math.min(100,percent)} aria-label="Porcentaje de capacidad utilizada"/>}
    </article>)}</div>
    <div className="statistics-panels">
      <section className="card statistics-panel"><div className="card-heading"><div><h3>Matrícula activa por nivel</h3><p>Estudiantes por nivel académico</p></div></div><SeriesChart series={series[0]}/></section>
      <section className="card statistics-panel"><div className="card-heading"><div><h3>Distribución por género</h3><p>Proporción de estudiantes activos</p></div></div><SeriesChart series={series.find(s=>s.title==='Distribución por género')!}/></section>
    </div>
  </section>;
}

function Select({label,value,onChange,options,empty}:{label:string;value:string;onChange:(value:string)=>void;options:string[];empty:string}){
  return <label className="field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>
    <option value="">{empty}</option>{options.map(o=><option key={o}>{o}</option>)}
  </select></label>;
}
function tableHead(s:Series) {
  return s.kind==='capacity'?['Sección','Activos','Espacios disponibles','Cupo máximo']:['Categoría','Estudiantes'];
}
function tableValues(e:Entry,s:Series) {
  return s.kind==='capacity'?[e.name,e.value,e.available??0,SECTION_CAPACITY]:[e.name,e.value];
}
function totals(s:Series) {
  const value=s.entries.reduce((sum,e)=>sum+e.value,0);
  return s.kind==='capacity'?[value,s.entries.reduce((sum,e)=>sum+(e.available??0),0),s.entries.length*SECTION_CAPACITY]:[value];
}
function SeriesChart({series:s}:{series:Series}){
  if(!s.entries.some(e=>e.value||e.available))return <p className="statistics-empty">No hay registros para estos filtros.</p>;
  if(s.kind==='pie')return <div className="statistics-pie">
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart><Pie data={s.entries} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="70%">
        {s.entries.map((e,index)=><Cell key={e.name} fill={colors[index%colors.length]}/>)}
      </Pie><Tooltip formatter={(value)=>[value,'Estudiantes']}/><Legend/></PieChart>
    </ResponsiveContainer>
  </div>;
  return <div className="statistics-chart" style={{height:Math.max(200,s.entries.length*32+60)}}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={s.entries} layout="vertical" margin={{left:5,right:20,top:10,bottom:5}}>
        <CartesianGrid strokeDasharray="3 5" horizontal={false}/>
        <XAxis type="number" allowDecimals={false} tick={{fontSize:12}}/>
        <YAxis type="category" dataKey="name" width="auto" interval={0} tick={{fontSize:12}}/>
        <Tooltip/>
        <Bar dataKey="value" name={s.kind==='capacity'?'Activos':'Estudiantes'} fill={colors[0]} stackId="capacity" maxBarSize={20}/>
        {s.kind==='capacity'&&<Bar dataKey="available" name="Espacios disponibles" fill="#88bfba" stackId="capacity" maxBarSize={20}/>}
        {s.kind==='capacity'&&<Legend/>}
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
