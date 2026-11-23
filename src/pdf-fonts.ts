type Weight='normal'|'bold';
type ArialFonts={normal:Uint8Array;bold?:Uint8Array};
let reportArial:Promise<ArialFonts>|undefined;
let canvasArial:Promise<string>|undefined;
export const PDF_FONT='Arial';
const unavailable='La fuente Arial de los informes no está disponible. Comuníquese con soporte institucional.';

function table(view:DataView,tag:string) {
  for(let index=0;index<view.getUint16(4);index++){
    const record=12+index*16;
    if(String.fromCharCode(...new Uint8Array(view.buffer,view.byteOffset+record,4))!==tag)continue;
    const start=view.getUint32(record+8),length=view.getUint32(record+12);
    if(start+length>view.byteLength)throw Error('Tabla TrueType incompleta.');
    return new DataView(view.buffer,view.byteOffset+start,length);
  }
  throw Error('Falta una tabla obligatoria de la fuente TrueType.');
}

export function validateArial(bytes:Uint8Array,weight:Weight) {
  const error=weight==='bold'?'El recurso de informes debe ser Arial negrita (.ttf).':'El recurso de informes debe ser Arial regular (.ttf).';
  let flags:number;
  try{
    const font=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(font.getUint32(0)!==0x00010000)throw Error();
    table(font,'glyf');
    const os=table(font,'OS/2'), names=table(font,'name');
    const size=os.getUint16(4), selection=os.getUint16(62);
    if((selection&0x201)||(weight==='bold'?size!==700:size!==400))throw Error();
    const strings=names.getUint16(4);
    const families:string[]=[];
    for(let index=0;index<names.getUint16(2);index++){
      const offset=6+index*12, id=names.getUint16(offset+6);
      if(id!==1&&id!==16)continue;
      const platform=names.getUint16(offset),length=names.getUint16(offset+8);
      const at=strings+names.getUint16(offset+10);
      if(at+length>names.byteLength)throw Error();
      const value=new Uint8Array(names.buffer,names.byteOffset+at,length);
      families.push(new TextDecoder(platform===0||platform===3?'utf-16be':'windows-1252').decode(value).trim().toLowerCase());
    }
    if(!families.includes('arial'))throw Error();
    flags=os.getUint16(8);
  }catch{throw Error(error)}
  if(flags&0x302||((flags&4)&&!(flags&8))){
    throw Error('El recurso Arial de informes requiere una licencia que permita incrustación editable o instalable y subconjuntos en PDF.');
  }
}

async function downloadArial(url:string,weight:Weight){
  const response=await fetch(url,{referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error(unavailable);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>5_000_000)throw Error(unavailable);
  validateArial(bytes,weight);
  return bytes;
}

export function loadReportArial(){
  if(!reportArial){
    const regular=import.meta.env.VITE_PDF_ARIAL_REGULAR_URL?.trim()||`${import.meta.env.BASE_URL}fonts/arial-regular.ttf`;
    const bold=import.meta.env.VITE_PDF_ARIAL_BOLD_URL?.trim();
    reportArial=Promise.all([downloadArial(regular,'normal'),bold?downloadArial(bold,'bold'):undefined])
      .then(([normal,bold])=>({normal,bold}))
      .catch(()=>{
        reportArial=undefined;
        throw Error(unavailable);
      });
  }
  return reportArial;
}

export function reportCanvasFont(){
  if(!canvasArial){
    canvasArial=loadReportArial().then(async({normal,bold})=>{
      const family='Arial de informes';
      const faces=await Promise.all([
        new FontFace(family,new Uint8Array(normal).buffer,{weight:'400'}).load(),
        new FontFace(family,new Uint8Array(bold??normal).buffer,{weight:'700'}).load(),
      ]);
      faces.forEach(face=>document.fonts.add(face));
      return `"${family}"`;
    }).catch(error=>{
      canvasArial=undefined;
      throw error;
    });
  }
  return canvasArial;
}

export function fontBase64(bytes:Uint8Array){
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary);
}
