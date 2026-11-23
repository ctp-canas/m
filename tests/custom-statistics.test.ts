import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {analyze,defaultAnalysis,operationsFor,type Analysis} from '../src/custom-statistics';
import {sectionLabel,sortName,rows,type Row} from '../src/domain';
import {seventhGradeRows,originColumns} from '../src/origin-report';
import {reportColumnLabel,reportValue} from '../src/reports';
import {reportLayout} from '../src/report-layout';
import {loadReportArial,validateArial} from '../src/pdf-fonts';
import {seed} from '../src/seed';

const db=seed(), records=rows(db,2027), config=defaultAnalysis(2027);
const template=records.find(r=>r.enrollment.status==='Activo')!;
const fixture=(birthdates:string[]):Row[]=>birthdates.map((birthdate,i)=>({
  student:{...template.student,id:String(i),birthdate},
  enrollment:{...template.enrollment,studentId:String(i)},
}));

describe('Estadísticas personalizadas',()=>{
  it('calcula recuento y porcentajes de una población única y respeta el año',()=>{
    const scope={...config,group:'grade',operation:'percent'} satisfies Analysis;
    const result=analyze([...records,...records,...rows(db,2026)],db,scope);
    const active=records.filter(r=>r.enrollment.status==='Activo');
    expect(result.total).toEqual(['Total',active.length,'100 %']);
    expect(result.table.reduce((sum,row)=>sum+Number(row[1]),0)).toBe(active.length);
    expect(result.formats).toContain('donut');
  });
  it('fuerza matrícula activa al agrupar por género y calcula los márgenes cruzados',()=>{
    const result=analyze(records,db,{...config,filters:{...config.filters,status:'Inactivo'},variable:'grade',operation:'cross',group:'gender'});
    expect(result.population).toBe(records.filter(r=>r.enrollment.status==='Activo').length);
    expect(result.total?.at(-1)).toBe(result.population);
    expect(result.formats).toContain('stacked');
    expect(result.scope).toContain('Matrícula activa');
  });
  it('excluye edades inválidas y calcula promedio, extremos e histograma',()=>{
    const data=fixture(['2011-04-11','2012-01-01','2010-03-29','','2011-02-31']);
    const scope={...config,variable:'age' as const};
    const mean=analyze(data,db,{...scope,operation:'average'},'2027-01-02');
    expect(mean.total).toEqual(['Resultado general',3,15.33]);
    expect(analyze(data,db,{...scope,operation:'range'},'2027-01-02').total).toEqual(['Resultado general',3,15,16]);
    expect(analyze(data,db,{...scope,operation:'frequency'},'2027-01-02').total).toEqual(['Total',3,'100 %']);
  });
  it('mide el cupo físico de una sección aun al consultar solo un subgrupo',()=>{
    const row=records.find(r=>r.enrollment.grade===7&&r.enrollment.section==='1')!;
    const filters={...config.filters,grade:'7',section:sectionLabel(row.enrollment),subgroup:'A'};
    const result=analyze([...records,...records],db,{...config,variable:'available',operation:'comparison',filters});
    const active=records.filter(r=>r.enrollment.status==='Activo'&&sectionLabel(r.enrollment)==='7-1').length;
    expect(result.table).toEqual([['7-1',1,34-active]]);
  });
  it('impide promedios categóricos y cruces sin segunda categoría',()=>{
    expect(operationsFor('origin')).not.toContain('average');
    expect(operationsFor('students')).not.toContain('cross');
    expect(()=>analyze(records,db,{...config,variable:'origin',operation:'average'})).toThrow();
    expect(()=>analyze(records,db,{...config,variable:'origin',operation:'cross'})).toThrow();
    const empty=analyze([],db,{...config,operation:'percent'});
    expect(empty.total).toEqual(['Total',0,'0 %']);
    expect(empty.formats).toEqual(['table']);
  });
});

describe('Informe de procedencia de sétimo',()=>{
  it('lista solo activos del curso, deduplica, ordena y conserva el centro registrado',()=>{
    const eligible=records.filter(r=>r.enrollment.grade===7&&r.enrollment.status==='Activo');
    const name='Escuela Experimental de Enseñanza Primaria de Cañas';
    const sample={...eligible[0],student:{...eligible[0].student,previousSchool:name}};
    const input=[sample,...records.slice().reverse(),...rows(db,2026),sample];
    const selected=seventhGradeRows(input,2027,'');
    expect(selected.map(r=>r.student.id)).toEqual([...eligible].sort(sortName).map(r=>r.student.id));
    expect(reportValue(selected.find(r=>r.student.id===sample.student.id)!,'previousSchool')).toBe(name);
    expect(reportValue({...sample,student:{...sample.student,previousSchool:''}},'previousSchool')).toBe('No registrado');
    expect(originColumns.map(key=>reportColumnLabel(key,{cedula:true}))).toEqual(['Cédula','Nombre completo','Sección','Centro educativo de procedencia']);
    const scoped=seventhGradeRows(input,2027,'7-1');
    expect(scoped.every(r=>sectionLabel(r.enrollment)==='7-1')).toBe(true);
    expect(reportLayout(scoped,originColumns,'unified','7-1').columns).not.toContain('group');
  });
});

it('rechaza otras familias como fuente de los informes',()=>{
  const alternative=new Uint8Array(readFileSync('tests/fixtures/manrope-regular.ttf'));
  expect(()=>validateArial(alternative,'normal')).toThrow(/Arial regular/);
});


// Minimal TrueType metadata for the loader test. This is not a printable font.
function testArialMetadata(weight:number,embedding=0){
  const bytes=Buffer.alloc(168);
  bytes.writeUInt32BE(0x10000);
  bytes.writeUInt16BE(3,4);
  const tables:[string,number,number][]=[['glyf',60,1],['OS/2',64,64],['name',128,28]];
  tables.forEach(([name,start,length],index)=>{
    const offset=12+16*index;
    bytes.write(name,offset,'ascii');
    bytes.writeUInt32BE(start,offset+8);
    bytes.writeUInt32BE(length,offset+12);
  });
  bytes.writeUInt16BE(weight,68);
  bytes.writeUInt16BE(embedding,72);
  bytes.writeUInt16BE(1,130);
  bytes.writeUInt16BE(18,132);
  bytes.writeUInt16BE(3,134);
  bytes.writeUInt16BE(1,140);
  bytes.writeUInt16BE(10,142);
  for(const [i,char] of [...'Arial'].entries())bytes.writeUInt16BE(char.charCodeAt(0),146+i*2);
  return new Uint8Array(bytes);
}

it('descarga Arial automáticamente, comparte la carga y permite reintentar',async()=>{
  const fetchFont=vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null,{status:404}))
    .mockImplementation(async url=>new Response(testArialMetadata(String(url).endsWith('negrita.ttf')?700:400)));
  vi.stubGlobal('fetch',fetchFont);
  vi.stubEnv('VITE_PDF_ARIAL_REGULAR_URL','');
  vi.stubEnv('VITE_PDF_ARIAL_BOLD_URL','');
  try{
    await expect(loadReportArial()).rejects.toThrow(/Arial de los informes no está disponible/);
    expect(fetchFont.mock.calls[0][0]).toMatch(/fonts\/arial-regular\.ttf$/);
    vi.stubEnv('VITE_PDF_ARIAL_REGULAR_URL','/tipografia/regular.ttf');
    vi.stubEnv('VITE_PDF_ARIAL_BOLD_URL','/tipografia/negrita.ttf');
    const first=loadReportArial();
    expect(loadReportArial()).toBe(first);
    await expect(first).resolves.toEqual({normal:testArialMetadata(400),bold:testArialMetadata(700)});
    expect(fetchFont.mock.calls.map(([url])=>url).slice(1)).toEqual(['/tipografia/regular.ttf','/tipografia/negrita.ttf']);
    await loadReportArial();
    expect(fetchFont).toHaveBeenCalledTimes(3);
  }finally{
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it('rechaza fuentes autorizadas solo para previsualizar e imprimir',()=>{
  expect(()=>validateArial(testArialMetadata(400,4),'normal')).toThrow(/incrustación editable o instalable/);
});
