import {useEffect,useMemo,useState} from 'react';
import {Download,Printer} from 'lucide-react';
import type {State} from './domain';
import {filterTransfers,transferDateLabel,validTransferDate,type TransferEvent,type TransferFilters} from './transfer-events';
import {institutionalPdf,pdfHeadingWeight,type Artwork} from './institutional-pdf';
import {PDF_FONT} from './pdf-fonts';
import {downloadSheet} from './sheets';
import type {PdfPreviewRequest} from './pdf-preview';
import {getReportSession,remoteTransfers,reportingConfigured,useReportSession} from './lib/report-backend';
import {ReportConnection} from './report-configuration';

export const transferTitle='Informe de traslados de estudiantes';
export const transferColumns=['Fecha de traslado','Nivel','Nombre completo','Cédula'];
const levels=[7,8,9,10,11,12];
const rowValues=(event:TransferEvent)=>[
  transferDateLabel(event.date),event.grade?`${event.grade}°`:'No registrado',event.name,event.identification,
];
const filterDetails=({start,end,grade,section}:TransferFilters,count:number)=>[
  start&&`Desde ${transferDateLabel(start)}`,end&&`Hasta ${transferDateLabel(end)}`,
  grade&&`Nivel ${grade}°`,section&&`Sección ${grade?`${grade}-`:''}${section}`,`Total de traslados: ${count}`,
].filter(Boolean).join(' · ');

export async function transferPdf(events:TransferEvent[],filters:TransferFilters,institution:string,institutional=false,artwork?:Artwork){
  const {doc,margin,h,top,bottom,finish}=await institutionalPdf({
    title:transferTitle,year:filters.year,institution,detail:filterDetails(filters,events.length),institutional,
  },artwork);
  const {default:autoTable}=await import('jspdf-autotable');
  autoTable(doc,{
    head:[transferColumns],body:events.map(rowValues),startY:top,
    margin:{top,bottom:h-bottom,left:margin,right:margin},showHead:'everyPage',rowPageBreak:'avoid',
    styles:{font:PDF_FONT,fontStyle:'normal',fontSize:9,cellPadding:5,overflow:'linebreak'},
    headStyles:{fontStyle:pdfHeadingWeight(doc),fillColor:[8,115,111]},
    columnStyles:{0:{cellWidth:95},1:{cellWidth:68},3:{cellWidth:112}},
    alternateRowStyles:{fillColor:[245,248,248]},
  });
  return finish();
}

export function TransferReport({db,year,onPreview,toast}:{db:State;year:number;onPreview:(request:PdfPreviewRequest)=>void;toast:(message:string)=>void}){
  const [filters,setFilters]=useState<TransferFilters>({year,start:'',end:'',grade:'',section:''});
  const session=useReportSession();
  const [remote,setRemote]=useState<{session:typeof session;key:string;events:TransferEvent[]}|null>(null);
  const [error,setError]=useState('');
  const key=JSON.stringify(filters);
  const remoteMatches=remote?.session===session&&remote?.key===key;
  const valid=(!filters.start||validTransferDate(filters.start))&&(!filters.end||validTransferDate(filters.end))&&(!filters.start||!filters.end||filters.start<=filters.end);
  useEffect(()=>{
    if(!session?.transfers||!valid)return;
    let active=true;
    setError('');setRemote(null);
    void remoteTransfers(session.client,filters).then(events=>{if(active)setRemote({session,key,events})})
      .catch(err=>{if(active)setError((err as Error).message)});
    return ()=>{active=false};
  },[session,filters,key,valid]);
  const items=useMemo(()=>filterTransfers(session?remoteMatches?remote.events:[]:db.transferEvents??[],filters),
    [session,remote,remoteMatches,db.transferEvents,filters]);
  const change=(name:keyof TransferFilters,value:string)=>{
    setError('');
    setFilters(current=>({...current,[name]:name==='year'?Number(value):value,...(name==='grade'||name==='year'?{section:''}:{})}));
  };
  const canView=!reportingConfigured||!!session?.transfers;
  const loading=!!session?.transfers&&valid&&!remoteMatches&&!error;
  const ready=canView&&valid&&!loading&&!error;
  const exportExcel=async()=>{
    try{
      await downloadSheet([[transferTitle],[db.settings.institution],[`Curso lectivo ${filters.year} · ${filterDetails(filters,items.length)}`],
        transferColumns,...items.map(rowValues)],`CTP_Canas_Traslados_${filters.year}.xlsx`,'Traslados',{headings:[4],widths:[23,16,44,24]});
      toast('Informe de traslados exportado.');
    }catch(err){toast((err as Error).message)}
  };
  const academicYears=session?Array.from({length:81},(_,i)=>2100-i):db.years.map(entry=>entry.year);
  return <section className="card transfer-report">
    <div className="card-heading"><div><h3>{transferTitle}</h3><p>Historial por fecha efectiva, curso y nivel del traslado.</p></div></div>
    <div className="report-config">
      {reportingConfigured&&<ReportConnection/>}
      {session&&!session.transfers&&<p role="alert" className="error-banner">La cuenta no tiene permiso para consultar traslados.</p>}
      {canView&&<>
        <div className="form-grid three">
          <label className="field"><span>Curso lectivo del informe</span><select value={filters.year} onChange={e=>change('year',e.target.value)}>{academicYears.map(value=><option key={value}>{value}</option>)}</select></label>
          <label className="field"><span>Fecha inicial</span><input type="date" value={filters.start} max={filters.end||undefined} onChange={e=>change('start',e.target.value)}/></label>
          <label className="field"><span>Fecha final</span><input type="date" value={filters.end} min={filters.start||undefined} onChange={e=>change('end',e.target.value)}/></label>
          <label className="field"><span>Nivel académico</span><select value={filters.grade} onChange={e=>change('grade',e.target.value)}><option value="">Todos los niveles</option>{levels.map(value=><option key={value} value={value}>{value}°</option>)}</select></label>
          <label className="field"><span>Sección</span><select value={filters.section} onChange={e=>change('section',e.target.value)}><option value="">Todas las secciones</option>{[1,2,3,4].map(value=><option key={value} value={value}>{filters.grade?`${filters.grade}-${value}`:value}</option>)}</select></label>
        </div>
        {!valid&&<p className="error-banner" role="alert">Ingrese fechas válidas. La fecha inicial debe ser anterior o igual a la final.</p>}
        {error&&<p className="error-banner" role="alert">{error}</p>}
        {loading&&<p role="status">Consultando el historial…</p>}
        {ready&&<div className="report-export flex">
          <strong>{items.length} {items.length===1?'traslado':'traslados'}</strong>
          <button className="button secondary" onClick={()=>void exportExcel()}><Download size={16}/> Descargar Excel</button>
          <button className="button primary" onClick={()=>onPreview({title:transferTitle,filename:`CTP_Canas_Traslados_${filters.year}.pdf`,
            generate:()=>{
              if(session!==getReportSession())throw Error('La sesión de informes cambió. Abra el informe de nuevo.');
              return transferPdf(items,filters,db.settings.institution,!!session);
            }})}><Printer size={16}/> Vista previa e impresión PDF</button>
        </div>}
      </>}
    </div>
    {ready&&<>
      <div className="table-wrap"><table aria-label={transferTitle}>
        <thead><tr>{transferColumns.map(column=><th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{items.map(item=><tr key={item.id}>{rowValues(item).map((value,index)=><td key={index}>{value}</td>)}</tr>)}</tbody>
      </table></div>
      {!items.length&&<p className="statistics-empty">No se encontraron traslados para los filtros seleccionados.</p>}
    </>}
  </section>;
}
