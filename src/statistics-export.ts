import {institutionalPdf,pdfHeadingWeight,pdfText} from './institutional-pdf';
import {PDF_FONT,reportCanvasFont} from './pdf-fonts';
import {paintChart} from './custom-chart';
import type {AnalysisResult,ChartType} from './custom-statistics';

export async function statisticsPdf(result:AnalysisResult,year:number,institution:string,format:ChartType,includeTable:boolean,includeChart:boolean){
  const {doc,w,h,width,margin,top,bottom,finish}=await institutionalPdf({
    title:result.title,year,institution,detail:`${result.scope.replace(`Curso ${year} · `,'')} · ${result.summary}`,
  });
  if(includeTable){
    const {default:autoTable}=await import('jspdf-autotable');
    const body=[...result.table,...(result.total?[result.total]:[])].map(row=>row.map(value=>typeof value==='number'?value.toLocaleString('es-CR',{maximumFractionDigits:2}):value));
    autoTable(doc,{
      head:[result.headers],body,
      startY:top,margin:{top,bottom:h-bottom,left:margin,right:margin},
      styles:{font:PDF_FONT,fontStyle:'normal',fontSize:9,cellPadding:5,overflow:'linebreak'},
      headStyles:{fontStyle:pdfHeadingWeight(doc),fillColor:[8,115,111]},showHead:'everyPage',rowPageBreak:'avoid',
      horizontalPageBreak:true,horizontalPageBreakRepeat:0,
    });
  }
  if(includeChart){
    const font=await reportCanvasFont();
    const chunk=format==='pie'||format==='donut'||format==='histogram'?result.matrix.length:format==='grouped'?9:15;
    for(let start=0;start<result.matrix.length;start+=chunk){
      if(includeTable||start>0)doc.addPage();
      const canvas=paintChart(result,format,font,result.matrix.slice(start,start+chunk));
      const scale=Math.min(width/canvas.width,(bottom-top-21)/canvas.height);
      pdfText(doc,10,true);doc.text('Representación gráfica',margin,top+10);
      doc.addImage(canvas.toDataURL('image/png'),'PNG',(w-canvas.width*scale)/2,top+21,canvas.width*scale,canvas.height*scale);
    }
  }
  return finish();
}
