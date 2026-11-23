import {describe,expect,it} from 'vitest';
import {rows,sectionKey,sortName} from '../src/domain';
import {hasReportGroups,reportLayout} from '../src/report-layout';
import {reportValue} from '../src/reports';
import {seed} from '../src/seed';
import {statisticsSeries} from '../src/statistics-page';

describe('Organización de informes',()=>{
  const db=seed();
  const all=rows(db,2027);
  const first=all.filter(r=>r.enrollment.grade===7&&r.enrollment.section==='1');
  it('usa la sección en el encabezado y conserva ambos subgrupos en un documento',()=>{
    const layout=reportLayout(first,['number','name','group','signature'],'separate');
    expect(hasReportGroups(first,db.groups)).toBe(true);
    expect(layout.section).toBe('7-1');
    expect(layout.columns).toEqual(['number','name','signature']);
    expect(layout.blocks.map(b=>b.title)).toEqual(['Subgrupo A','Subgrupo B']);
    expect(layout.blocks.flatMap(b=>b.rows).sort(sortName)).toEqual([...first].sort(sortName));
    expect(reportValue(first[0],'signature')).toBe('');
    expect(reportValue(first[0],'number',3)).toBe(4);
  });
  it('ofrece una lista unificada con una columna Sección cuando combina secciones',()=>{
    const layout=reportLayout(all,['name','identification']);
    expect(layout.section).toBe('');
    expect(layout.columns).toEqual(['name','identification','group']);
    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0].rows).toHaveLength(312);
  });
  it('conserva la sección solicitada aun si los filtros no devuelven filas',()=>{
    const layout=reportLayout([],['name','group'],'unified','7-1');
    expect(layout.section).toBe('7-1');
    expect(layout.columns).toEqual(['name']);
  });
});

describe('Datos compartidos por tablas y gráficos',()=>{
  it('respeta el filtro y deduplica, con el cupo real de cada sección',()=>{
    const db=seed();
    const all=rows(db,2027);
    const filters={grade:'7',section:'7-1',specialty:'',status:'Inactivo'};
    const series=statisticsSeries([...all,...all],db,2027,filters);
    const pending=all.filter(r=>sectionKey(r.enrollment)==='2027:7:1'&&r.enrollment.status==='Inactivo').length;
    const active=all.filter(r=>sectionKey(r.enrollment)==='2027:7:1'&&r.enrollment.status==='Activo').length;
    expect(series[0].entries).toEqual([{name:'7°',value:pending}]);
    expect(series[1].entries).toEqual([{name:'7-1',value:pending}]);
    expect(series.find(s=>s.kind==='capacity')!.entries).toEqual([{name:'7-1',value:active,available:34-active}]);
  });
});

it('omite Estado incluso al cargar una plantilla de un curso anterior',()=>{
  const records=rows(seed(),2027);
  const legacy=['status','name','group','insurance'];
  expect(reportLayout(records,legacy,'separate').columns).toEqual(['name','group','insurance']);
  expect(legacy).toContain('status');
  expect(records.some(r=>r.enrollment.status==='Inactivo')).toBe(true);
});
