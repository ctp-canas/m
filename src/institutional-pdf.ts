import type {jsPDF} from 'jspdf';
import {fontBase64,PDF_FONT,loadReportArial} from './pdf-fonts';
import {artworkFiles,artworkMime,localArtworkBytes,type ArtworkSlot} from './report-artwork';
import {loadState} from './store';
import {downloadArtwork,getRemoteArtwork,getReportSession} from './lib/report-backend';

export type Artwork={header:Uint8Array|null;footer:Uint8Array|null};
export type PdfHeading={title:string;year:number;institution:string;detail?:string;landscape?:boolean;institutional?:boolean};

export async function institutionalArtwork():Promise<Artwork>{
  const connected=getReportSession();
  const remote=connected?.artwork?await getRemoteArtwork(connected.client):null;
  const local=!remote&&typeof indexedDB!=='undefined'?(await loadState()).reportArtwork:undefined;
  const bytes=async(slot:ArtworkSlot)=>{
    const choice=remote?.find(item=>item.slot===slot);
    if(choice?.mode==='hidden'||!remote&&local?.[slot]?.mode==='hidden')return null;
    if(connected&&choice?.object_path){
      const blob=await downloadArtwork(connected.client,choice.object_path);
      const image=new Uint8Array(await blob.arrayBuffer());
      artworkMime(image);
      return image;
    }
    const localChoice=local?.[slot];
    if(localChoice?.mode==='custom')return localArtworkBytes(localChoice.dataUrl);
    const result=await fetch(`${import.meta.env.BASE_URL}assets/${artworkFiles[slot]}`);
    if(!result.ok)throw Error('No se pudo cargar la imagen institucional.');
    return new Uint8Array(await result.arrayBuffer());
  };
  const [header,footer]=await Promise.all([bytes('header'),bytes('footer')]);
  return {header,footer};
}

export const pdfHeadingWeight=(doc:jsPDF)=>doc.getFontList()[PDF_FONT]?.includes('bold')?'bold':'normal';
export function pdfText(doc:jsPDF,size:number,bold=false,gray=25){
  doc.setFont(PDF_FONT,bold?pdfHeadingWeight(doc):'normal');
  doc.setFontSize(size);
  doc.setTextColor(gray);
}
export async function institutionalPdf(heading:PdfHeading,artwork?:Artwork){
  const [{jsPDF},art,fonts]=await Promise.all([import('jspdf'),artwork??institutionalArtwork(),loadReportArial()]);
  const doc=new jsPDF({format:'letter',orientation:heading.landscape?'landscape':'portrait',unit:'pt',compress:true,putOnlyUsedFonts:true});
  for(const weight of ['normal','bold'] as const){
    const bytes=fonts[weight];
    if(!bytes)continue;
    const file=`Arial-${weight}.ttf`;
    doc.addFileToVFS(file,fontBase64(bytes));
    doc.addFont(file,PDF_FONT,weight);
    doc.setFont(PDF_FONT,weight);
    const face=doc.getFont().metadata as {characterToGlyph?:(code:number)=>number};
    if(!face?.characterToGlyph||[...'Aa 0123456789 ÁÉÍÓÚÜÑáéíóúüñ °·%–…'].some(character=>!face.characterToGlyph!(character.charCodeAt(0)))){
      throw Error('Arial no se pudo incrustar con todos los caracteres requeridos.');
    }
  }
  doc.setProperties({title:heading.title,author:heading.institution});
  const margin=36,w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight(),width=w-2*margin;
  const fit=(image:Uint8Array|null,maxHeight:number)=>{
    if(!image)return null;
    const properties=doc.getImageProperties(image);
    const scale=Math.min(width/properties.width,maxHeight/properties.height);
    const imageWidth=properties.width*scale;
    return {image,x:(w-imageWidth)/2,width:imageWidth,height:properties.height*scale,
      format:artworkMime(image)==='image/png'?'PNG':'JPEG'};
  };
  const header=fit(art.header,Math.min(94,h*0.16)),footer=fit(art.footer,Math.min(68,h*0.12));
  const headerHeight=header?.height??0,footerHeight=footer?.height??0;
  pdfText(doc,15,true);
  const title:string[]=doc.splitTextToSize(heading.title,width);
  pdfText(doc,9);
  const detail:string[]=doc.splitTextToSize(`Curso lectivo ${heading.year}${heading.detail?` · ${heading.detail}`:''}`,width);
  const titleY=23+headerHeight+15,detailY=titleY+title.length*17;
  const top=detailY+detail.length*12+16;
  const bottom=h-footerHeight-36;
  function finish(){
    const pages=doc.getNumberOfPages();
    for(let page=1;page<=pages;page++){
      doc.setPage(page);
      if(header)doc.addImage(header.image,header.format,header.x,18,header.width,header.height,'encabezado');
      pdfText(doc,15,true);doc.text(title,margin,titleY,{lineHeightFactor:17/15});
      pdfText(doc,9);doc.text(detail,margin,detailY,{lineHeightFactor:12/9});
      if(footer)doc.addImage(footer.image,footer.format,footer.x,h-footerHeight-24,footer.width,footer.height,'pie');
      pdfText(doc,8,false,80);
      if(import.meta.env.MODE==='test'&&!heading.institutional)doc.text('ENTORNO DE PRUEBAS · DATOS FICTICIOS',margin,h-13);
      doc.text(`Página ${page} de ${pages}`,w-margin,h-13,{align:'right'});
    }
    return doc;
  }
  return {doc,margin,w,h,width,top,bottom,finish};
}
