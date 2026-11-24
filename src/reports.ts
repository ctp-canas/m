import {fullName,insurance,sectionLabel,type Row,type State} from './domain';
import {reportLayout,type Organization} from './report-layout';
import {downloadSheet} from './sheets';
import {institutionalPdf,pdfHeadingWeight,type Artwork} from './institutional-pdf';
import {PDF_FONT} from './pdf-fonts';

export const reportColumns:Record<string,string> = {
  number:'N.º', identification:'Identificación', name:'Nombre completo', group:'Sección',
  specialty:'Especialidad', previousSchool:'Centro educativo de procedencia', guardian:'Encargado principal', phone:'Teléfono',
  policy:'N.° de póliza', expiry:'Vencimiento', insurance:'Estado de póliza', accommodation:'Adecuación',
  religion:'Educación Religiosa', condition:'Condición académica', departure:'Persona autorizada',
  documents:'Documentación', signature:'Firma',
};
export type ReportOptions = {
  landscape?:boolean;
  organization?:Organization;
  section?:string;
  filters?:string;
  purpose?:string;
  eventDate?:string;
  audience?:string;
  cedula?:boolean;
  institution?:string;
};
export function reportColumnLabel(key:string, options:ReportOptions={}) {
  return key === 'identification' && (options.purpose||options.cedula) ? 'Cédula' : reportColumns[key];
}
export function reportValue(row:Row,key:string,index=0):string|number {
  const {student:s,enrollment:e}=row;
  const guardian=s.guardians.find(x=>x.primary);
  const departure=s.departureContacts.length?s.departureContacts:s.guardians.filter(x=>x.departure);
  const values:Record<string,string|number> = {
    number:index+1, identification:s.identification,
    name:`${s.surname1} ${s.surname2}, ${s.name}`.replace(/ +,/g,','), group:sectionLabel(e),
    specialty:e.specialty||'III Ciclo', previousSchool:s.previousSchool?.trim()||'No registrado', guardian:guardian?.name||'Sin registrar',
    phone:guardian?.phone||'—', policy:e.policy||'Sin registrar', expiry:e.policyExpiry||'—',
    insurance:insurance(e).label, accommodation:e.accommodation, religion:e.religion?'Sí':'No',
    condition:e.condition, departure:departure.map(g=>`${g.name} · ${g.phone}`).join('; ')||'Sin persona autorizada',
    documents:`${e.documents.filter(d=>['Verificado','No aplica'].includes(d.status)).length}/${e.documents.length} verificados`, signature:'',
  };
  return values[key]??'';
}
export const reportFilename=(year:number,title:string,ext:string)=>`CTP_Canas_${year}_${title.replace(/\W+/g,'_')}.${ext}`;
function reportDetails(year:number,count:number,section:string,options:ReportOptions,withYear=true) {
  const date = options.eventDate?.split('-').reverse().join('/');
  return [
    withYear&&`Curso lectivo ${year}`,section && `Sección: ${section}`,options.audience,
    date && `Fecha de la actividad: ${date}`,options.filters,`Total: ${count}`,
  ].filter(Boolean).join(' · ');
}
export async function exportXlsx(rr:Row[],requested:string[],title:string,year:number,options:ReportOptions={}) {
  const {section,columns,blocks}=reportLayout(rr,requested,options.organization,options.section);
  const heading=[title,options.purpose].filter(Boolean).join(' · ');
  const data:(string|number)[][]=[
    [heading],
    [options.institution||'Colegio Técnico Profesional de Cañas'],
    [reportDetails(year,rr.length,section,options)],
    ['ENTORNO DE PRUEBAS — DATOS FICTICIOS'],
  ];
  const headings:number[]=[];
  for(const block of blocks) {
    if(block.title)data.push([], [block.title]);
    data.push(columns.map(k=>reportColumnLabel(k,options)));
    headings.push(data.length);
    data.push(...block.rows.map((r,i)=>columns.map(k=>reportValue(r,k,i))));
  }
  const widths = columns.map(k => k==='name'?43:k==='signature'?30:k==='number'?8:k==='previousSchool'?52:27);
  await downloadSheet(data,reportFilename(year,title,'xlsx'),'Informe',{headings,widths});
}
export async function buildReportPdf(rr:Row[],requested:string[],title:string,year:number,state:State,landscape=false,options:ReportOptions={},artwork?:Artwork) {
  const {section,columns,blocks}=reportLayout(rr,requested,options.organization,options.section);
  const {doc,margin,h,top,bottom,finish}=await institutionalPdf({
    title:[title,options.purpose].filter(Boolean).join(' · '),
    year,institution:state.settings.institution,landscape,detail:reportDetails(year,rr.length,section,options,false),
  },artwork);
  const {default:autoTable}=await import('jspdf-autotable');
  for(const [index,block] of blocks.entries()){
    if(index)doc.addPage();
    const labels=columns.map(k=>reportColumnLabel(k,options));
    const head=block.title?[[{content:block.title,colSpan:columns.length}],labels]:[labels];
    const signature=columns.indexOf('signature'),number=columns.indexOf('number'),school=columns.indexOf('previousSchool');
    autoTable(doc,{
      head,body:block.rows.map((r,i)=>columns.map(k=>reportValue(r,k,i))),
      startY:top,margin:{top,bottom:h-bottom,left:margin,right:margin},showHead:'everyPage',rowPageBreak:'avoid',
      styles:{font:PDF_FONT,fontStyle:'normal',fontSize:9,cellPadding:5,overflow:'linebreak'},
      columnStyles:{
        ...(signature>=0?{[signature]:{minCellWidth:96}}:{}),
        ...(number>=0?{[number]:{cellWidth:32}}:{}),
        ...(school>=0?{[school]:{minCellWidth:148}}:{}),
      },
      headStyles:{fillColor:[8,115,111],fontStyle:pdfHeadingWeight(doc)},alternateRowStyles:{fillColor:[245,248,248]},
    });
  }
  return finish();
}
export async function template(){
  const link=document.createElement('a');
  link.href=`${import.meta.env.BASE_URL}templates/Plantilla_importacion_estudiantes_CTP_Canas.xlsx`;
  link.download='Plantilla_importacion_estudiantes_CTP_Canas.xlsx';
  link.click();
}

export {fullName};
