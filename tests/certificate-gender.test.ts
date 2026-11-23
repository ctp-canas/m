import {readFileSync,writeFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {buildStudentSheet} from '../src/enrollment-certificate';
import {rows,sectionLabel,type Row} from '../src/domain';
import {seed} from '../src/seed';
import {buildReportPdf} from '../src/reports';
import {originColumns,originTitle,seventhGradeRows} from '../src/origin-report';
import {scopedGenderStatistics} from '../src/statistics-page';
import {transferPdf} from '../src/transfer-report';

// The project fonts verify PDF geometry only. The automatic Arial loader is tested separately.
vi.mock('../src/pdf-fonts',async importOriginal=>{
  const real=await importOriginal<typeof import('../src/pdf-fonts')>();
  return {...real,loadReportArial:async()=>({
    normal:new Uint8Array(readFileSync('tests/fixtures/manrope-regular.ttf')),
    bold:new Uint8Array(readFileSync('tests/fixtures/manrope-bold.ttf')),
  })};
});

describe('Hoja de datos del estudiante',()=>{
  const crest=new Uint8Array(readFileSync('public/assets/escudo.jpeg'));
  const options={institution:'Colegio Técnico Profesional de Cañas',issuedOn:'2027-02-12',artwork:{
    header:new Uint8Array(readFileSync('public/assets/encabezado.png')),
    footer:new Uint8Array(readFileSync('public/assets/pie.png')),
  }};
  const active=rows(seed(),2027).find(r=>r.enrollment.status==='Activo')!;
  it('genera el PDF carta vertical y coloca el marco sin fotografía cuando falta',async()=>{
    const doc=await buildStudentSheet(active,options);
    expect(doc.internal.pageSize.getWidth()).toBe(612);
    expect(doc.internal.pageSize.getHeight()).toBe(792);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output().match(/\/Subtype \/Image\b/g)).toHaveLength(2);
  });
  it('incrusta la fotografía que viene en el expediente',async()=>{
    const student={...active.student,photo:`data:image/jpeg;base64,${Buffer.from(crest).toString('base64')}`};
    const doc=await buildStudentSheet({...active,student},options);
    expect(doc.output().match(/\/Subtype \/Image\b/g)).toHaveLength(3);
  });
  it('genera una continuación legible para datos extensos',async()=>{
    const student={...active.student,address:'Dirección extensa de prueba. '.repeat(900)};
    const doc=await buildStudentSheet({...active,student},options);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
  it('pagina el informe de procedencia con nombres largos y recursos institucionales',async()=>{
    const db=seed();
    const sample=seventhGradeRows(rows(db,2027),2027,'').map(row=>({...row,student:{...row.student,
      previousSchool:'Escuela Experimental de Enseñanza Primaria y Desarrollo Integral de la Comunidad de Cañas, Guanacaste',
    }}));
    const doc=await buildReportPdf(sample,originColumns,originTitle,2027,db,false,{cedula:true},options.artwork);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.output().match(/\/Subtype \/Image\b/g)).toHaveLength(2);
  });

  it('repite ambas imágenes y las columnas en todas las páginas del informe de traslados',async()=>{
    const filters={year:2027,start:'2027-02-01',end:'2027-03-31',grade:'8',section:'1'};
    const events=Array.from({length:100},(_,i)=>({
      id:String(i),enrollmentId:String(i),year:2027,date:'2027-03-12',grade:8,section:'1',
      name:'María José Núñez Cañas',identification:`QATRANS${i}`,
    }));
    const custom={header:crest,footer:options.artwork.footer};
    const doc=await transferPdf(events,filters,options.institution,true,custom);
    expect(doc.internal.pageSize.getWidth()).toBe(612);
    expect(doc.internal.pageSize.getHeight()).toBe(792);
    const pages=doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    expect(doc.output().match(/\/Subtype \/Image\b/g)).toHaveLength(2);
    expect(doc.output().match(/\/I[01] Do/g)).toHaveLength(pages*2);
    const hidden=await transferPdf(events.slice(0,1),filters,options.institution,true,{header:null,footer:null});
    expect(hidden.output()).not.toMatch(/\/Subtype \/Image\b/);
    if(process.env.QA_TRANSFER_PDF)writeFileSync(process.env.QA_TRANSFER_PDF,Buffer.from(doc.output('arraybuffer')));
  });
});

describe('Género por sección',()=>{
  const db=seed();
  const all=rows(db,2027);
  const filters={grade:'',section:'',specialty:'',status:'Activo'};
  it('coincide con las matrículas activas, incluso con subgrupos y filas duplicadas',()=>{
    const stats=scopedGenderStatistics([...all,...all,...rows(db,2026)],db,2027,filters);
    const active=all.filter(r=>r.enrollment.status==='Activo');
    expect(stats.sections).toHaveLength(24);
    expect(stats.totals.total).toBe(active.length);
    for(const section of stats.sections){
      expect(section.total).toBe(active.filter(r=>sectionLabel(r.enrollment)===section.name).length);
    }
  });
  it('prioriza matrículas activas aunque el filtro pida inactivas',()=>{
    const stats=scopedGenderStatistics(all,db,2027,{...filters,grade:'7',section:'7-1',status:'Inactivo'});
    const expected=all.filter(r=>r.enrollment.status==='Activo'&&sectionLabel(r.enrollment)==='7-1').length;
    expect(stats.sections.map(({name,total})=>[name,total])).toEqual([['7-1',expected]]);
    const empty=scopedGenderStatistics([],db,2027,{...filters,grade:'8'});
    expect(empty.sections).toHaveLength(4);
    expect(empty.totals.total).toBe(0);
  });
  it('separa Otro de No especificado y reconoce solo categorías admitidas',()=>{
    const template=all.find(r=>r.enrollment.status==='Activo')!;
    const records=['Otro','','No indicado',' desconocido ','  femenino '].map((gender,i):Row=>({
      enrollment:{...template.enrollment,studentId:`fake-${i}`},
      student:{...template.student,id:`fake-${i}`,gender},
    }));
    expect(scopedGenderStatistics(records,db,2027,filters).totals).toEqual({male:0,female:1,other:1,unspecified:3,total:5});
  });
});
