import {useEffect,useMemo,useRef,useState} from 'react';
import {BarChart3,Download,FileText,Image,Printer,SlidersHorizontal} from 'lucide-react';
import {rows,sectionLabel,type State} from './domain';
import {downloadSheet} from './sheets';
import {categories,measures,operations,chartTypes,operationsFor,groupsFor,needsActive,needsGroup,capacityVariable,
  analyze,defaultAnalysis,type Analysis,type ChartType} from './custom-statistics';
import {matchesAcademic,ordered,statuses,type Filters} from './statistics-scope';
import {CustomChart,paintChart} from './custom-chart';
import {statisticsPdf} from './statistics-export';
import {reportCanvasFont} from './pdf-fonts';

export function StatSelect({label,value,change,options,disabled=false}:{
  label:string;value:string|number;change:(value:string)=>void;options:readonly (readonly [string,string])[];disabled?:boolean;
}){
  return <label className="field"><span>{label}</span><select value={value} onChange={event=>change(event.target.value)} disabled={disabled}>
    {options.map(([key,name])=><option key={key} value={key}>{name}</option>)}
  </select></label>;
}
const options=(items:string[],empty:string):[string,string][]=>[['',empty],...items.map(item=>[item,item] as [string,string])];
const labelPairs=Object.entries(categories).map(([key,value])=>[key,value.label] as const);
const visualizationLabel=(format:ChartType)=>chartTypes[format];
const same=(a:Analysis,b:Analysis)=>JSON.stringify(a)===JSON.stringify(b);

export function CustomStatisticsBuilder({db,year,toast}:{db:State;year:number;toast:(message:string)=>void}){
  const [config,setConfig]=useState(()=>defaultAnalysis(year));
  const [applied,setApplied]=useState<Analysis|null>(null);
  const [includeTable,setIncludeTable]=useState(true);
  const [includeChart,setIncludeChart]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [pdf,setPdf]=useState('');
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++},[]);
  useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf)},[pdf]);
  const population=useMemo(()=>rows(db,config.year),[db,config.year]);
  const configured=db.groups.filter(group=>group.year===config.year);
  const levelGroups=configured.filter(group=>!config.filters.grade||group.grade===Number(config.filters.grade));
  const sectionGroups=levelGroups.filter(group=>!config.filters.section||sectionLabel(group)===config.filters.section);
  const academic=population.map(row=>row.enrollment);
  const possibleLevels=academic.filter(e=>!config.filters.grade||e.grade===Number(config.filters.grade));
  const matching=academic.filter(e=>matchesAcademic(e,{...config.filters,subgroup:'',specialty:''}));
  const sections=ordered([...levelGroups,...possibleLevels].filter(g=>g.section).map(sectionLabel));
  const subgroups=ordered([...sectionGroups,...matching].map(group=>group.subgroup));
  const specialties=ordered([...sectionGroups,...matching].map(group=>group.specialty));
  const groups=groupsFor(config);
  const applyChanges=(changes:Partial<Analysis>)=>{
    const next={...config,...changes};
    if(!operationsFor(next.variable).includes(next.operation))next.operation=operationsFor(next.variable)[0];
    const valid=groupsFor(next);
    if(next.group&&!valid.includes(next.group))next.group='';
    if(needsGroup(next)&&!next.group)next.group=valid.includes('grade')?'grade':valid[0]??'';
    setConfig(next);setError('');
  };
  const updateFilter=(key:keyof Filters,value:string)=>{
    const clear=key==='grade'?{section:'',subgroup:'',specialty:''}:key==='section'?{subgroup:'',specialty:''}:{};
    applyChanges({filters:{...config.filters,...clear,[key]:value}});
  };
  const candidate=useMemo(()=>analyze(population,db,config),[population,db,config]);
  const visual=candidate.formats.includes(config.visual)?config.visual:'table';
  const chartFormat=applied?.visual!=='table'?applied?.visual:undefined;
  const appliedResult=useMemo(()=>applied?analyze(rows(db,applied.year),db,applied):null,[db,applied]);
  const result=appliedResult;
  const actualChart=result&&(chartFormat&&result.formats.includes(chartFormat)?chartFormat:result.formats.find(format=>format!=='table'));
  const selected={...config,visual};
  const showResults=()=>{
    setPdf('');setApplied(selected);setError('');
  };
  const spreadsheet=async()=>{
    if(!result||!applied)return;
    try{
      await downloadSheet([[result.title],[result.scope],[result.summary],result.headers,...result.table,...(result.total?[result.total]:[])],
        `Estadisticas_personalizadas_${applied.year}.xlsx`,'Estadísticas',{headings:[4],widths:result.headers.map((_,i)=>i===0?38:24)});
      toast('Estadísticas exportadas.');
    }catch(err){setError((err as Error).message)}
  };
  const image=async()=>{
    if(!result||!actualChart)return;
    setError('');
    try{
      const font=await reportCanvasFont();
      paintChart(result,actualChart,font,result.matrix,true).toBlob(blob=>{
        if(!blob){setError('No se pudo preparar la imagen del gráfico.');return;}
        const url=URL.createObjectURL(blob),link=document.createElement('a');
        link.download='Grafico_estadistico_CTP_Canas.png';link.href=url;
        document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      },'image/png');
    }catch(err){setError((err as Error).message)}
  };
  const previewPdf=async()=>{
    if(!result||!applied)return;
    setError('');setBusy(true);
    const request=++generation.current;
    setPdf('');
    try{
      const doc=await statisticsPdf(result,applied.year,db.settings.institution,actualChart||'table',includeTable,Boolean(actualChart&&includeChart));
      if(request===generation.current)setPdf(URL.createObjectURL(doc.output('blob')));
    }catch(err){if(request===generation.current)setError((err as Error).message)}
    finally{if(request===generation.current)setBusy(false)}
  };
  return <div className="statistics-builder">
    <section className="card builder-card">
      <div className="card-heading"><div><p className="stats-kicker">Exploración de datos</p><h2>Estadísticas personalizadas</h2><p>Configure una consulta de datos agrupados del curso lectivo.</p></div><SlidersHorizontal size={25}/></div>
      <form className="builder-form" onSubmit={event=>{event.preventDefault();showResults()}}>
        <fieldset><legend>1. Seleccionar población</legend><div className="form-grid three">
          <StatSelect label="Curso lectivo del análisis" value={config.year} change={value=>applyChanges({year:Number(value),filters:{...config.filters,section:'',subgroup:'',specialty:''}})} options={db.years.map(entry=>[String(entry.year),String(entry.year)])}/>
          <StatSelect label="Nivel académico" value={config.filters.grade} change={value=>updateFilter('grade',value)} options={options(['7','8','9','10','11','12'],'Todos los niveles')}/>
          <StatSelect label="Sección" value={config.filters.section} change={value=>updateFilter('section',value)} options={options(sections,'Todas las secciones')}/>
          <StatSelect label="Subgrupo" value={config.filters.subgroup??''} change={value=>updateFilter('subgroup',value)} options={options(subgroups,'Todos los subgrupos')} disabled={!subgroups.length}/>
          <StatSelect label="Especialidad técnica" value={config.filters.specialty} change={value=>updateFilter('specialty',value)} options={options(specialties,'Todas las especialidades')} disabled={!specialties.length}/>
          <StatSelect label="Estado de matrícula" value={needsActive(config)?'Activo':config.filters.status} change={value=>updateFilter('status',value)} options={options([...statuses],'Todos los estados')} disabled={needsActive(config)}/>
        </div>
        {needsActive(config)&&<p className="muted">{capacityVariable(config.variable)?'Se usa la matrícula activa de cada sección seleccionada para medir su capacidad real.':'Las estadísticas de género se calculan exclusivamente con estudiantes activos.'}</p>}
        </fieldset>
        <div className="builder-steps">
          <fieldset><legend>2. Seleccionar variables</legend>
            <StatSelect label="Variable principal" value={config.variable} change={value=>applyChanges({variable:value as Analysis['variable'],group:''})} options={[...Object.entries(measures),...labelPairs]}/>
          </fieldset>
          <fieldset><legend>3. Configurar análisis</legend>
            <StatSelect label="Tipo de análisis" value={config.operation} change={value=>applyChanges({operation:value as Analysis['operation']})} options={operationsFor(config.variable).map(key=>[key,operations[key]])}/>
            {!!groups.length&&<StatSelect label="Agrupar por" value={config.group} change={value=>applyChanges({group:value as Analysis['group']})}
              options={[...(!needsGroup(config)?[['','Sin agrupación'] as const]:[]),...labelPairs.filter(([key])=>groups.includes(key as typeof groups[number]))]}/>}
          </fieldset>
          <fieldset><legend>4. Seleccionar visualización</legend>
            <StatSelect label="Formato" value={visual} change={value=>applyChanges({visual:value as ChartType})} options={candidate.formats.map(format=>[format,visualizationLabel(format)])}/>
            <p className="muted">{candidate.formats.length>1?`Formato recomendado: ${visualizationLabel(candidate.formats[0]).toLowerCase()}.`:'La tabla conserva el detalle de esta consulta.'}</p>
          </fieldset>
        </div>
        <div className="builder-submit"><span>{candidate.population} estudiantes según los filtros</span>
          <button className="button primary" disabled={busy}><BarChart3 size={17}/>5. Generar estadísticas</button></div>
      </form>
    </section>
    {result&&applied&&<section className="card builder-card">
      <div className="card-heading"><div><p className="stats-kicker">Resultado de la consulta</p><h3>{result.title}</h3><p>{result.scope}</p></div></div>
      <p className="builder-result-note">{result.summary}</p>
      {!same(selected,applied)&&<p className="builder-result-note" role="status">La configuración cambió. Genere las estadísticas para aplicar los nuevos filtros.</p>}
      {!result.table.length?<p className="statistics-empty">No hay datos para este análisis. Ajuste los filtros y vuelva a generar.</p>:<>
        {chartFormat&&actualChart&&<CustomChart result={result} format={actualChart}/>}
        <div className="table-wrap"><table aria-label="Resultados del análisis personalizado">
          <thead><tr>{result.headers.map((label,index)=><th key={index} scope="col">{label}</th>)}</tr></thead>
          <tbody>{result.table.map((row,index)=><tr key={index}>{row.map((value,i)=>i===0?<th scope="row" key={i}>{value}</th>:<td key={i}>{typeof value==='number'?value.toLocaleString('es-CR',{maximumFractionDigits:2}):value}</td>)}</tr>)}</tbody>
          {result.total&&<tfoot><tr>{result.total.map((value,i)=>i===0?<th scope="row" key={i}>{value}</th>:<td key={i}>{typeof value==='number'?value.toLocaleString('es-CR',{maximumFractionDigits:2}):value}</td>)}</tr></tfoot>}
        </table></div>
        <div className="builder-download">
          <div className="builder-download-options">
            <label><input type="checkbox" checked={includeTable} onChange={event=>setIncludeTable(event.target.checked)}/> Incluir tabla en PDF</label>
            {actualChart&&<label><input type="checkbox" checked={includeChart} onChange={event=>setIncludeChart(event.target.checked)}/> Incluir gráfico en PDF</label>}
          </div>
          <div className="flex statistics-exports">
            <button className="button secondary" onClick={()=>void spreadsheet()}><Download size={16}/>Descargar Excel</button>
            {actualChart&&<button className="button secondary" onClick={()=>void image()}><Image size={16}/>Descargar gráfico PNG</button>}
            <button className="button primary" disabled={busy||(!includeTable&&!(actualChart&&includeChart))} onClick={()=>void previewPdf()}><FileText size={16}/>{busy?'Preparando…':'Vista previa PDF'}</button>
          </div>
          {error&&<p role="alert" className="error-banner">{error}</p>}
          {pdf&&<><iframe src={pdf} className="certificate-frame" title="Vista previa del PDF de estadísticas personalizadas"/>
            <div className="flex statistics-exports">
              <a className="button secondary" href={pdf} download={`Estadisticas_personalizadas_${applied.year}.pdf`}>Descargar PDF</a>
              <a className="button secondary" href={pdf} target="_blank" rel="noopener noreferrer"><Printer size={16}/>Abrir para imprimir</a>
            </div></>}
        </div>
      </>}
    </section>}
  </div>;
}
