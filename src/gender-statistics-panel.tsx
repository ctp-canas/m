import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {genderCategories,type genderBySection} from './gender-statistics';

export const genderTitle='Distribución de estudiantes por género y sección';
export const genderTableHeader=['Sección',...genderCategories.map(category=>category.label),'Total'];
export const genderTableValues=(item:ReturnType<typeof genderBySection>['totals'])=>[
  ...genderCategories.map(category=>item[category.key]),item.total,
];

export function GenderStatisticsPanel({data,view,stacked,setStacked}:{
  data:ReturnType<typeof genderBySection>;
  view:'table'|'chart';stacked:boolean;setStacked:(stacked:boolean)=>void;
}){
  return <section className="card statistics-panel statistics-wide">
    <div className="card-heading"><div><h3 id="gender-by-section-title">{genderTitle}</h3>
      <p>{data.totals.total} estudiantes activos según los filtros académicos seleccionados.</p></div>
      {view==='chart'&&<div className="tabs gender-chart-mode" role="group" aria-label="Formato del gráfico de género">
        <button className={!stacked?'selected':''} aria-pressed={!stacked} onClick={()=>setStacked(false)}>Agrupado</button>
        <button className={stacked?'selected':''} aria-pressed={stacked} onClick={()=>setStacked(true)}>Apilado</button>
      </div>}
    </div>
    {view==='table'?<div className="table-wrap"><table aria-labelledby="gender-by-section-title">
      <thead><tr>{genderTableHeader.map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{data.sections.map(section=><tr key={section.name}>
        <th scope="row">{section.name}</th>
        {genderTableValues(section).map((value,i)=><td key={i}>{value}</td>)}
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Total</th>{genderTableValues(data.totals).map((value,i)=><td key={i}>{value}</td>)}</tr></tfoot>
    </table></div>:<>
      <ul className="gender-legend" aria-label="Categorías de género">{genderCategories.map(category=><li key={category.key}>
        <span style={{backgroundColor:category.color}}/>{category.label}
      </li>)}</ul>
      {data.totals.total>0?<div className="gender-plot-scroll" tabIndex={0} role="region" aria-label="Gráfico por género y sección. Puede desplazarse horizontalmente.">
        <div className="gender-plot" style={{minWidth:Math.max(320,data.sections.length*77+56)}}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={data.sections} margin={{top:12,right:16,bottom:24,left:12}} barGap={3}>
              <CartesianGrid strokeDasharray="3 5" vertical={false}/>
              <XAxis dataKey="name" interval={0} tick={{fontSize:12}}
                label={{value:'Sección',position:'insideBottom',offset:-12}}/>
              <YAxis allowDecimals={false} width={42} tick={{fontSize:12}}
                label={{value:'Estudiantes',angle:-90,position:'insideLeft'}}/>
              <Tooltip labelFormatter={name=>`Sección ${name}`}/>
              {genderCategories.map(category=><Bar key={category.key} dataKey={category.key} name={category.label}
                fill={category.color} stackId={stacked?'gender':undefined} maxBarSize={stacked?38:20} isAnimationActive={false}/>)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>:<p className="statistics-empty">No hay estudiantes activos para estos filtros.</p>}
    </>}
  </section>;
}
