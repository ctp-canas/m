import {fullName,uid,type Enrollment,type State,type Student} from './domain';

export type TransferEvent={
  id:string;enrollmentId:string;year:number;date:string;grade:number|null;section:string;
  name:string;identification:string;
};
export type TransferFilters={year:number;start:string;end:string;grade:string;section:string};

export function validTransferDate(value?:string):value is string{
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

function snapshot(id:string,enrollment:Enrollment,student:Student,date:string):TransferEvent{
  return {
    id,enrollmentId:enrollment.id,year:enrollment.year,date,grade:enrollment.grade,section:enrollment.section,
    name:fullName(student),identification:student.identification,
  };
}

// Legacy data only proves a current transfer when it has an explicitly registered date.
export function ensureTransferHistory(state:State){
  if(Array.isArray(state.transferEvents))return state.transferEvents;
  const students=new Map(state.students.map(student=>[student.id,student]));
  state.transferEvents=state.enrollments.flatMap(enrollment=>{
    const student=students.get(enrollment.studentId);
    return student&&enrollment.status==='Traslado'&&validTransferDate(enrollment.effectiveDate)
      ?[snapshot(`previo-${enrollment.id}`,enrollment,student,enrollment.effectiveDate)]:[];
  });
  return state.transferEvents;
}

export function recordTransfer(state:State,previous:Enrollment|undefined,next:Enrollment,student:Student){
  if(next.status!=='Traslado'||!validTransferDate(next.effectiveDate))return;
  const history=ensureTransferHistory(state);
  if(previous?.status!=='Traslado'){
    history.push(snapshot(uid(),next,student,next.effectiveDate));
    return;
  }
  const current=[...history].reverse().find(event=>event.enrollmentId===next.id);
  if(!current){
    history.push(snapshot(uid(),next,student,next.effectiveDate));
  }else if(previous.effectiveDate!==next.effectiveDate){
    current.date=next.effectiveDate;
  }
}

export function filterTransfers(events:TransferEvent[],filters:TransferFilters){
  const {year,start,end,grade,section}=filters;
  const unique=new Map<string,TransferEvent>();
  for(const event of events){
    if(event.year!==year||!validTransferDate(event.date)||start&&event.date<start||end&&event.date>end
      ||grade&&event.grade!==Number(grade)||section&&event.section!==section)continue;
    unique.set(event.id,event);
  }
  return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)
    ||a.name.localeCompare(b.name,'es-CR')||a.identification.localeCompare(b.identification,'es-CR')||a.id.localeCompare(b.id));
}

export function transferDateLabel(date:string){
  const [year,month,day]=date.split('-');
  return `${day}/${month}/${year}`;
}
