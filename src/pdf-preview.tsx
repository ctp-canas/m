import {useEffect,useState,type ReactNode} from 'react';
import type {jsPDF} from 'jspdf';
import {Download,Printer} from 'lucide-react';

export type PdfPreviewRequest={title:string;filename:string;generate:()=>Promise<jsPDF>;onExport?:()=>void};

export function PdfPreview({title,filename,generate,onExport,children}:PdfPreviewRequest&{children?:ReactNode}){
  const [preview,setPreview]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true,url='';
    setPreview('');setError('');
    void generate().then(doc=>{
      if(!active)return;
      url=URL.createObjectURL(doc.output('blob'));
      setPreview(url);
    }).catch(err=>{
      if(active)setError(`No se pudo preparar el PDF. ${err instanceof Error?err.message:''}`);
    });
    return ()=>{active=false;if(url)URL.revokeObjectURL(url)};
  },[generate]);
  return <>
    <div className="modal-body certificate-body">
      {error?<><p className="error-banner" role="alert">{error}</p>{children}</>:preview
        ? <iframe className="certificate-frame" title={`Vista previa de ${title} en PDF`} src={preview}/>
        : <p role="status">Preparando vista previa…</p>}
    </div>
    {preview&&<div className="modal-footer certificate-actions">
      <a className="button secondary" href={preview} onClick={onExport} download={filename}><Download size={16}/>Descargar PDF</a>
      <a className="button primary" href={preview} onClick={onExport} target="_blank" rel="noopener noreferrer"><Printer size={16}/>Abrir para imprimir</a>
    </div>}
  </>;
}
