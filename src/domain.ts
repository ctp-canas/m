import type {TransferEvent} from './transfer-events';
import type {LocalReportArtwork} from './report-artwork';
export type Status='Activo'|'Inactivo'|'Traslado'|'Retiro de matrícula';
export type DocStatus='Pendiente'|'Recibido'|'Verificado'|'Rechazado'|'No aplica';
export interface Guardian{id:string;name:string;identification:string;phone:string;email:string;relationship:string;primary:boolean;departure:boolean}
export interface Student{id:string;identification:string;idType:string;name:string;surname1:string;surname2:string;birthdate:string;gender:string;province:string;canton:string;district:string;address:string;previousSchool:string;phone?:string;guardians:Guardian[];departureContacts:Guardian[];photo?:string;createdAt:string}
export interface Enrollment{id:string;studentId:string;year:number;grade:number;section:string;subgroup:string;specialty:string;status:Status;condition:string;policy:string;policyExpiry:string;accommodation:string;religion:boolean;photoConsent:string;medical:{state:string;conditions:string;allergies:string;medications:string;contraindications:string;emergency:string};documents:{name:string;status:DocStatus;note:string;date?:string}[];verified:string[];notes:string;confirmedAt?:string;effectiveDate?:string;updatedAt:string}
export interface Group{id:string;year:number;grade:number;section:string;subgroup:string;specialty:string;capacity:number}
export interface Audit{id:string;at:string;actor:string;action:string;record:string}
export interface State{revision:number;transferEvents?:TransferEvent[];reportArtwork?:LocalReportArtwork;students:Student[];enrollments:Enrollment[];years:{year:number;status:'Abierto'|'Cerrado'|'Preparación'}[];groups:Group[];audit:Audit[];settings:{institution:string;phone:string;email:string;insuranceThreshold:number;documents:string[];specialties:string[]};reportTemplates:{name:string;columns:string[];report:string}[]}
export type Row={student:Student;enrollment:Enrollment};
export const uid=()=>crypto.randomUUID();
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const fullName=(s:Student)=>`${s.name} ${s.surname1} ${s.surname2}`.trim();
export const sortName=(a:Row,b:Row)=>`${a.student.surname1} ${a.student.surname2} ${a.student.name}`.localeCompare(`${b.student.surname1} ${b.student.surname2} ${b.student.name}`,'es');
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const age=(birthdate:string,at=today())=>{if(!birthdate)return null;const [y,m,d]=birthdate.split('-').map(Number);const [cy,cm,cd]=at.split('-').map(Number);return cy-y-(cm<m||(cm===m&&cd<d)?1:0)};
export function insurance(e:Enrollment,threshold=15,at=today()){if(!e.policy||!e.policyExpiry)return {label:'Sin información',tone:'gray',days:null};const days=Math.round((Date.parse(e.policyExpiry+'T12:00:00Z')-Date.parse(at+'T12:00:00Z'))/86400000);return {label:days<0?'Vencida':days<=threshold?'Por vencer':'Vigente',tone:days<0?'red':days<=threshold?'amber':'green',days}}
export function rows(state:State,year:number){return state.enrollments.filter(e=>e.year===year).map(enrollment=>({enrollment,student:state.students.find(s=>s.id===enrollment.studentId)!})).filter(r=>r.student).sort(sortName)}
export const verificationSteps=['Identificación','Datos personales','Ubicación académica','Domicilio','Encargados legales','Autorización de salida','Póliza','Adecuaciones','Educación Religiosa','Autorización de fotografía','Verificación médica','Documentación'];
export function groupLabel(e:Pick<Enrollment,'grade'|'section'|'subgroup'>){return e.section?`${e.grade}-${e.section}${e.subgroup}`:`${e.grade}° · Sin asignar`}
export const SECTION_CAPACITY = 34;
export const SECTION_FULL = 'La sección seleccionada ha alcanzado su capacidad máxima de 34 estudiantes. Seleccione otra sección disponible.';

type Section = Pick<Enrollment,'year'|'grade'|'section'>;
export const sectionLabel = (e:Pick<Section,'grade'|'section'>) =>
  e.section ? `${e.grade}-${e.section}` : `${e.grade}° · Sin asignar`;
export const sectionKey = (e:Section) => `${e.year}:${e.grade}:${e.section}`;
export const groupKey = (e:Pick<Enrollment,'subgroup'|'specialty'>) =>
  JSON.stringify([e.subgroup,e.specialty]);
export const groupTitle = (e:Pick<Enrollment,'subgroup'|'specialty'>) =>
  [e.subgroup && `Subgrupo ${e.subgroup}`,e.specialty].filter(Boolean).join(' · ') || 'Sin subgrupo ni especialidad';
export function sectionOccupancy(state:Pick<State,'enrollments'>, section:Section, exclude?:string) {
  const active = state.enrollments.filter(e =>
    e.status === 'Activo' && e.id !== exclude && sectionKey(e) === sectionKey(section)
  ).length;
  return {active, available:Math.max(0,SECTION_CAPACITY-active)};
}
export const GROUP_CAPACITY=17;
export const GROUP_FULL='El subgrupo o especialidad ha alcanzado su capacidad máxima de 17 estudiantes.';
export function groupOccupancy(state:Pick<State,'enrollments'>,group:Group|Enrollment,exclude?:string){
  const sameSection=state.enrollments.filter(e=>e.status==='Activo'&&e.id!==exclude&&sectionKey(e)===sectionKey(group));
  const subgroup=group.subgroup?sameSection.filter(e=>e.subgroup===group.subgroup).length:0;
  const specialty=group.specialty?sameSection.filter(e=>e.specialty===group.specialty).length:0;
  const active=Math.max(subgroup,specialty);
  return {active,available:Math.max(0,GROUP_CAPACITY-active)};
}
export function placementErrors(e:Enrollment,state:State) {
  const group=state.groups.find(g=>sectionKey(g)===sectionKey(e)&&groupKey(g)===groupKey(e));
  if(!e.section||!group)return ['Seleccione un grupo configurado.'];
  if(e.grade>=10&&!group.specialty)return ['Asigne una especialidad al grupo antes de matricular.'];
  const saved=state.enrollments.find(x=>x.id===e.id);
  const sameSection=saved?.status==='Activo'&&sectionKey(saved)===sectionKey(e);
  if(!sameSection&&!sectionOccupancy(state,e,e.id).available)return [SECTION_FULL];
  const sameSubgroup=sameSection&&saved.subgroup===e.subgroup;
  const sameSpecialty=sameSection&&saved.specialty===e.specialty;
  if((!sameSubgroup||!sameSpecialty)&&!groupOccupancy(state,e,e.id).available)return [GROUP_FULL];
  return [];
}

export function readiness(row:Row,state:State){const {student:s,enrollment:e}=row;const errors:string[]=[];const warnings:string[]=[];
if(!s.identification||!s.name||!s.surname1||!s.birthdate)errors.push('Complete la identificación y los datos personales.');
if(!s.address||!s.canton||!s.district)errors.push('Complete el domicilio.');
if(!s.guardians.some(g=>g.primary&&g.name&&/^\+?[\d\s-]{8,15}$/.test(g.phone)))errors.push('Registre un encargado principal con teléfono válido.');
if(!e.section||(e.grade<=9&&!e.subgroup)||(e.grade>=10&&!e.specialty))errors.push('Complete la ubicación académica.');
if(verificationSteps.some(k=>!e.verified.includes(k)))errors.push('Finalice las doce verificaciones.');
if(e.documents.some(d=>!['Verificado','No aplica'].includes(d.status)))errors.push('Hay documentos pendientes de verificar.');
if(e.photoConsent==='Pendiente')errors.push('Registre la decisión sobre fotografías.');
if(e.medical.state==='Sin información')errors.push('Verifique la información médica.');
errors.push(...placementErrors(e,state));
if(state.years.find(y=>y.year===e.year)?.status!=='Abierto')errors.push('El curso lectivo no está abierto.');
if(insurance(e,state.settings.insuranceThreshold).tone!=='green')warnings.push('Revise la vigencia de la póliza.');
return {errors,warnings,ready:errors.length===0}}
export function audit(state:State,action:string,record:string){state.audit.unshift({id:uid(),at:new Date().toISOString(),actor:'Usuario autorizado',action,record})}
export function activate(state:State,ids:string[]){const result:{activated:string[];blocked:string[]}={activated:[],blocked:[]};for(const id of ids){const e=state.enrollments.find(x=>x.id===id);if(!e||e.status!=='Inactivo'){result.blocked.push(id);continue;}const s=state.students.find(x=>x.id===e.studentId)!;if(!s||!readiness({student:s,enrollment:e},state).ready){result.blocked.push(id);continue;}e.status='Activo';e.confirmedAt=new Date().toISOString();e.updatedAt=e.confirmedAt;audit(state,'Matrícula confirmada',fullName(s));result.activated.push(id)}return result}
export function blankStudent():Student{return {id:uid(),identification:'',idType:'Cédula nacional',name:'',surname1:'',surname2:'',birthdate:'',gender:'No indicado',province:'Guanacaste',canton:'Cañas',district:'Cañas',address:'',previousSchool:'',phone:'',guardians:[],departureContacts:[],createdAt:new Date().toISOString()}}
export function blankEnrollment(studentId:string,year:number,docs:string[]):Enrollment{return {id:uid(),studentId,year,grade:7,section:'',subgroup:'A',specialty:'',status:'Inactivo',condition:'Regular',policy:'',policyExpiry:'',accommodation:'NP',religion:true,photoConsent:'Pendiente',medical:{state:'Sin información',conditions:'',allergies:'',medications:'',contraindications:'',emergency:''},documents:docs.map(name=>({name,status:'Pendiente',note:''})),verified:[],notes:'',updatedAt:new Date().toISOString()}}
export function validateStudent(s:Student,state:State){const errors:string[]=[];const phone=s.phone?.trim();if(phone&&(!/^\+?[\d\s()-]+$/.test(phone)||phone.replace(/\D/g,'').length<8||phone.replace(/\D/g,'').length>15))errors.push('Revise el teléfono del estudiante: utilice de 8 a 15 dígitos; puede incluir código de país, espacios o guiones.');if(!/^[a-zA-Z0-9-]{5,25}$/.test(s.identification))errors.push('Ingrese una identificación alfanumérica de 5 a 25 caracteres, sin espacios.');if(!s.name.trim()||!s.surname1.trim())errors.push('El nombre y el primer apellido son obligatorios.');if(state.students.some(x=>x.id!==s.id&&normalize(x.identification)===normalize(s.identification)))errors.push('Ya existe un estudiante con esta identificación.');if(s.birthdate&&(!/^\d{4}-\d{2}-\d{2}$/.test(s.birthdate)||Number.isNaN(Date.parse(s.birthdate))||!(age(s.birthdate)!>=0)||s.birthdate>today()))errors.push('La fecha de nacimiento no es válida.');return errors}
export function rollover(state:State,from:number,to:number){if(state.years.some(y=>y.year===to))throw Error('Ese curso lectivo ya existe.');if(to<=from)throw Error('El nuevo curso debe ser posterior.');state.years.push({year:to,status:'Preparación'});const source=state.enrollments.filter(e=>e.year===from&&!['Retiro de matrícula','Traslado'].includes(e.status));for(const e of source){const next=blankEnrollment(e.studentId,to,state.settings.documents);next.grade=e.grade;next.condition=e.condition;next.accommodation=e.accommodation;next.religion=e.religion;state.enrollments.push(next)}state.groups.push(...state.groups.filter(g=>g.year===from).map(g=>({...g,id:uid(),year:to})));audit(state,'Curso lectivo preparado',`${from} → ${to}: ${source.length} matrículas inactivas; nivel pendiente de revisión.`)}
export function statistics(rr:Row[]){const active=rr.filter(r=>r.enrollment.status==='Activo');return {total:rr.length,active:active.length,pending:rr.filter(r=>r.enrollment.status==='Inactivo').length,iii:active.filter(r=>r.enrollment.grade<=9).length,technical:active.filter(r=>r.enrollment.grade>=10).length,transfers:rr.filter(r=>r.enrollment.status==='Traslado').length,withdrawn:rr.filter(r=>r.enrollment.status==='Retiro de matrícula').length,byGrade:[7,8,9,10,11,12].map(grade=>({name:`${grade}°`,Activos:active.filter(r=>r.enrollment.grade===grade).length,Pendientes:rr.filter(r=>r.enrollment.grade===grade&&r.enrollment.status==='Inactivo').length}))}}
