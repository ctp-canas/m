import {institutionalPdf,pdfText,type Artwork} from './institutional-pdf';
import {age, fullName, sectionLabel, today, type Row} from './domain';

type CertificateRow = Row & {student:Row['student'] & {nationality?:string; phone?:string; email?:string}};
type Field = {label:string; value:string; full?:boolean};
type SheetOptions = {institution:string; artwork?:Artwork; issuedOn?:string; official?:{name?:string; position?:string}};
export const studentPhoto=(photo?:string)=>photo&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(photo)?photo:undefined;
export const studentSheetTitle='Hoja de datos del estudiante';

function dateLabel(value?:string) {
  if(!value)return '';
  const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T12:00:00Z`:value);
  if(!Number.isFinite(date.getTime()))return '';
  return new Intl.DateTimeFormat('es-CR',{timeZone:'America/Costa_Rica',day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
}
function field(label:string,value?:string,full=false):Field {
  return {label,value:value?.trim()??'',full};
}
function fieldRows(fields:Field[],columns:number) {
  const rows:Field[][]=[];
  let pending:Field[]=[];
  for(const entry of fields.filter(f=>f.value)){
    if(entry.full){
      if(pending.length)rows.push(pending);
      pending=[];
      rows.push([entry]);
    } else {
      pending.push(entry);
      if(pending.length===columns){rows.push(pending);pending=[]}
    }
  }
  if(pending.length)rows.push(pending);
  return rows;
}

export async function buildStudentSheet(row:CertificateRow,{institution,artwork,issuedOn=today(),official}:SheetOptions) {
  const {student:s,enrollment:e}=row;
  const {doc,w,margin,width,top,bottom:limit,finish}=await institutionalPdf({
    title:studentSheetTitle,year:e.year,institution,detail:`Expediente estudiantil · ${fullName(s)} · ${s.identification}`,
  },artwork);
  const lineHeight=11;
  let y=top;
  const textStyle=(size:number,bold=false,gray=25)=>pdfText(doc,size,bold,gray);
  const rule=(x:number,top:number,length:number)=>{
    doc.setDrawColor(164);
    doc.setLineWidth(0.5);
    doc.line(x,top,x+length,top);
  };
  const newPage=()=>{doc.addPage();y=top};
  const sectionHeading=(title:string,boxWidth:number)=>{
    doc.setFillColor(244,244,244);
    doc.setDrawColor(164);
    doc.setLineWidth(0.5);
    doc.rect(margin,y,boxWidth,21,'FD');
    textStyle(9,true);
    doc.text(title,margin+8,y+14);
    y+=21;
  };
  const writeSection=(title:string,fields:Field[],boxWidth=width,columns=2)=>{
    const bands=fieldRows(fields,columns);
    if(!bands.length)return;
    if(y+56>limit)newPage();
    sectionHeading(title,boxWidth);
    for(const band of bands){
      const cellWidth=boxWidth/band.length;
      textStyle(10);
      const content=band.map(entry=>({...entry,lines:doc.splitTextToSize(entry.value,cellWidth-16) as string[]}));
      const count=Math.max(...content.map(entry=>entry.lines.length));
      if(y+16+Math.min(count,4)*lineHeight>limit){
        newPage();sectionHeading(`${title} (continuación)`,boxWidth);
      }
      let start=0;
      while(start<count){
        const take=Math.floor((limit-y-16)/lineHeight);
        if(take<1){
          newPage();sectionHeading(`${title} (continuación)`,boxWidth);
          continue;
        }
        const lines=Math.min(take,count-start);
        const height=16+lines*lineHeight;
        content.forEach((entry,i)=>{
          const x=margin+i*cellWidth;
          doc.setDrawColor(176);
          doc.setLineWidth(0.45);
          doc.rect(x,y,cellWidth,height);
          if(entry.lines.length<=start)return;
          textStyle(8,true,66);
          doc.text(start?`${entry.label} (continuación)`:entry.label,x+8,y+9);
          textStyle(10);
          doc.text(entry.lines.slice(start,start+lines),x+8,y+21,{lineHeightFactor:lineHeight/10});
        });
        y+=height;
        start+=lines;
      }
    }
    y+=9;
  };
  const photoWidth=95,photoHeight=117;
  const drawPhoto=(top:number)=>{
    const x=w-margin-photoWidth;
    doc.setDrawColor(153);
    doc.setLineWidth(0.6);
    doc.rect(x,top,photoWidth,photoHeight);
    const source=studentPhoto(s.photo);
    if(source){
      try{
        const photo=doc.getImageProperties(source);
        const scale=Math.min((photoWidth-8)/photo.width,(photoHeight-8)/photo.height);
        const imageWidth=photo.width*scale,imageHeight=photo.height*scale;
        doc.addImage(source,photo.fileType,x+(photoWidth-imageWidth)/2,top+(photoHeight-imageHeight)/2,imageWidth,imageHeight);
        return;
      }catch{/* An unreadable legacy photo should not prevent printing. */}
    }
    textStyle(9,false,90);
    doc.text(['Fotografía','no disponible'],x+photoWidth/2,top+photoHeight/2-1,{align:'center'});
  };

  const photoTop=y;
  drawPhoto(photoTop);
  const {identification,sections}=studentSheetFields(row,issuedOn);
  writeSection('Identificación del estudiante',identification,width-photoWidth-12);
  y=Math.max(y,photoTop+photoHeight+10);
  sections.forEach(([title,fields,columns])=>writeSection(title,fields,width,columns));

  const validationHeight=78;
  if(y+validationHeight>limit)newPage();
  y=Math.max(y,limit-validationHeight);
  sectionHeading('Validación institucional',width);
  doc.setDrawColor(164);
  doc.rect(margin,y,width,validationHeight-21);
  textStyle(9);
  doc.text(`Fecha de impresión: ${dateLabel(issuedOn)}`,margin+9,y+16);
  const officialLabel=[official?.name,official?.position].filter(Boolean).join(' · ');
  if(officialLabel)doc.text(officialLabel,margin+9,y+30,{maxWidth:width-170});
  rule(margin+9,y+37,width-174);
  doc.text('Firma de la persona funcionaria autorizada',margin+9,y+50);
  doc.setDrawColor(164);
  doc.rect(w-margin-144,y+6,133,45);
  doc.text('Sello institucional',w-margin-77.5,y+47,{align:'center'});

  return finish();
}

export function studentSheetFields({student:s,enrollment:e}:CertificateRow,issuedOn=today()){
  const birthDate=dateLabel(s.birthdate),studentAge=birthDate?age(s.birthdate,issuedOn):null;
  const identification=[
    field('Nombre completo',fullName(s),true),field('Identificación',s.identification),field('Tipo de identificación',s.idType),
    field('Fecha de nacimiento',birthDate),field('Edad',studentAge!==null&&Number.isFinite(studentAge)&&studentAge>=0?`${studentAge} años`:''),
    field('Género',s.gender==='No indicado'?'':s.gender),field('Nacionalidad',s.nationality),
  ];
  const sections:[string,Field[],number?][]=[['Información de matrícula',[
    field('Nivel académico',`${e.grade}°`),field('Sección',e.section?sectionLabel(e):''),
    field('Subgrupo',e.section?e.subgroup:''),field('Especialidad técnica',e.specialty),
    field('Fecha de matrícula',dateLabel(e.confirmedAt)),field('Condición académica',e.condition),
    field('Fecha efectiva del movimiento',dateLabel(e.effectiveDate)),
    field('Educación Religiosa',typeof e.religion==='boolean'?(e.religion?'Sí':'No'):''),
    field('Autorización de fotografías',e.photoConsent),field('Número de póliza',e.policy),
    field('Vencimiento de la póliza',dateLabel(e.policyExpiry)),field('Centro educativo de procedencia',s.previousSchool,true),
  ],3],['Domicilio y contacto del estudiante',[
    field('Provincia, cantón y distrito',[s.province,s.canton,s.district].filter(Boolean).join(', '),true),
    field('Dirección de residencia',s.address,true),field('Teléfono',s.phone),field('Correo electrónico',s.email),
  ]]];
  const addContact=(contact:Row['student']['guardians'][number],title:string)=>{
    sections.push([title,[
      field('Nombre completo',contact.name,true),field('Identificación',contact.identification),field('Parentesco',contact.relationship),
      field('Teléfono',contact.phone),field('Correo electrónico',contact.email),
    ]]);
  };
  const guardians=[...s.guardians].sort((a,b)=>Number(b.primary)-Number(a.primary));
  guardians.forEach((contact,i)=>addContact(contact,contact.primary?'Persona encargada principal':`Persona encargada ${i+1}`));
  s.departureContacts.forEach((contact,i)=>addContact(contact,`Persona autorizada para salida ${i+1}`));

  return {identification,sections};
}
