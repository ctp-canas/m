import {useCallback,useEffect,useState} from 'react';
import {buildStudentSheet,studentSheetFields,studentSheetTitle,studentPhoto} from './enrollment-certificate';
import {PdfPreview} from './pdf-preview';
import type {Row} from './domain';
import {institutionalArtwork} from './institutional-pdf';
import {artworkMime} from './report-artwork';
import {useReportSession} from './lib/report-backend';

function useArtworkPreview(){
  const session=useReportSession();
  const [art,setArt]=useState<{header:string;footer:string;error?:string}>({header:'',footer:''});
  useEffect(()=>{
    let active=true;
    const urls:string[]=[];
    const preview=(bytes:Uint8Array|null)=>{
      if(!bytes)return '';
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:artworkMime(bytes)}));
      urls.push(url);
      return url;
    };
    void institutionalArtwork().then(({header,footer})=>{
      if(active)setArt({header:preview(header),footer:preview(footer)});
    }).catch(()=>{if(active)setArt({header:'',footer:'',error:'No se pudieron mostrar las imágenes institucionales.'})});
    return ()=>{active=false;urls.forEach(url=>URL.revokeObjectURL(url))};
  },[session]);
  return art;
}

export function CertificatePreview({row,institution,onExport}:{row:Row;institution:string;onExport:()=>void}){
  const {identification,sections}=studentSheetFields(row);
  const photo=studentPhoto(row.student.photo);
  const art=useArtworkPreview();
  const generate=useCallback(()=>buildStudentSheet(row,{institution}),[row,institution]);
  const fields=(items:typeof identification)=><dl className="detail-grid">{items.filter(item=>item.value).map(item=>
    <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
  )}</dl>;
  return <PdfPreview title={studentSheetTitle} generate={generate} onExport={onExport} filename={`Hoja_datos_estudiante_${row.enrollment.year}.pdf`}>
    <article className="sheet-html-preview">
      {art.header&&<img className="sheet-artwork" src={art.header} alt={institution}/>}
      {art.error&&<p role="status">{art.error}</p>}
      <h3>{studentSheetTitle}</h3><p>Curso lectivo {row.enrollment.year} · Vista previa de datos</p>
      <div className="sheet-identification"><div><h4>Identificación del estudiante</h4>{fields(identification)}</div>
        <div className="sheet-photo">{photo?<img src={photo} alt="Fotografía del estudiante"/>:'Fotografía no disponible'}</div>
      </div>
      {sections.map(([title,items])=>items.some(item=>item.value)&&<section key={title}><h4>{title}</h4>{fields(items)}</section>)}
      {art.footer&&<img className="sheet-artwork" src={art.footer} alt="Pie institucional"/>}
    </article>
  </PdfPreview>;
}
