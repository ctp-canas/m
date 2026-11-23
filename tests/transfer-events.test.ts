import {expect,it} from 'vitest';
import {blankEnrollment,blankStudent} from '../src/domain';
import {seed} from '../src/seed';
import {ensureTransferHistory,filterTransfers,recordTransfer,validTransferDate} from '../src/transfer-events';

it('conserva traslados separados y corrige la fecha del evento actual',()=>{
  const db=seed();
  const student={...blankStudent(),name:'Ana',surname1:'Cañas',identification:'QATEST001'};
  const active={...blankEnrollment(student.id,2027,[]),status:'Activo' as const,grade:7,section:'2'};
  const transfer={...active,status:'Traslado' as const,effectiveDate:'2027-03-09'};
  recordTransfer(db,active,transfer,student);
  const corrected={...transfer,effectiveDate:'2027-03-10',grade:8};
  recordTransfer(db,transfer,corrected,student);
  const inactive={...corrected,status:'Inactivo' as const};
  recordTransfer(db,corrected,inactive,student);
  recordTransfer(db,inactive,{...corrected,effectiveDate:'2027-06-01'},student);
  const events=ensureTransferHistory(db).filter(event=>event.enrollmentId===active.id);
  expect(events.map(({date,grade})=>({date,grade}))).toEqual([{date:'2027-03-10',grade:7},{date:'2027-06-01',grade:8}]);
  expect(filterTransfers([...events,...events],{year:2027,start:'2027-03-10',end:'2027-03-10',grade:'7',section:'2'})).toEqual([events[0]]);
  expect(filterTransfers(events,{year:2026,start:'',end:'',grade:'',section:''})).toEqual([]);
});

it('recupera únicamente traslados anteriores con fecha válida y ordena empates por nombre',()=>{
  const db=seed();
  const student={...blankStudent(),name:'Zaira',surname1:'Mora',identification:'QATEST002'};
  db.students=[student];
  const legacy={...blankEnrollment(student.id,2027,[]),status:'Traslado' as const,grade:9,section:'3',effectiveDate:'2027-01-15'};
  db.enrollments=[legacy,{...legacy,id:'sin-fecha',effectiveDate:''},{...legacy,id:'inactivo',status:'Inactivo'}];
  const events=ensureTransferHistory(db);
  expect(events).toHaveLength(1);
  expect(validTransferDate('2027-02-30')).toBe(false);
  const other={...events[0],id:'otro',name:'Ana Mora'};
  expect(filterTransfers([...events,other],{year:2027,start:'',end:'',grade:'',section:''}).map(event=>event.name)).toEqual(['Ana Mora','Zaira Mora']);
});
