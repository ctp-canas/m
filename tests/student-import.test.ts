import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {expect,it} from 'vitest';
import {seed} from '../src/seed';
import {studentImportFields,studentImportPreview} from '../src/student-import';
import {readSheet} from '../src/sheets';

const mapping=Object.fromEntries(studentImportFields.map(([key])=>[key,key]));
function database(){
  const db=seed();db.students=[];db.enrollments=[];
  db.groups=[
    {id:'iii',year:2027,grade:7,section:'1',subgroup:'A',specialty:'',capacity:17},
    {id:'diversificada',year:2027,grade:10,section:'3',subgroup:'B',specialty:'Inteligencia Artificial',capacity:17},
  ];return db;
}
const sample={identificacion:'000123456',nombre:'Persona de Prueba',primer_apellido:'Ejemplo',nivel:7,seccion:'1',subgrupo:'A',telefono_estudiante:'+506 8888-0000'};

it('la plantilla tiene los doce encabezados exactos y no importa los ejemplos de la guía',async()=>{
  const bytes=readFileSync('public/templates/Plantilla_importacion_estudiantes_CTP_Canas.xlsx');
  const book=new ExcelJS.Workbook();await book.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(book.worksheets[0].name).toBe('Estudiantes');
  const header=book.worksheets[0].getRow(1).values;
  expect(Array.isArray(header)?header.slice(1):[]).toEqual(studentImportFields.map(([key])=>key));
  expect(book.worksheets[0].rowCount).toBeLessThanOrEqual(3001);
  expect(book.worksheets[0].getCell('A2').numFmt).toBe('@');
  expect(book.worksheets[0].getCell('L2').numFmt).toBe('@');
  const exampleDate=book.worksheets[1].getCell('C16').value;
  expect(exampleDate instanceof Date?exampleDate.toISOString().slice(0,10):exampleDate).toBe('2013-01-15');
  const file={name:'plantilla.xlsx',arrayBuffer:async()=>Uint8Array.from(bytes).buffer} as File;
  expect(await readSheet(file)).toEqual([]);
});

it('conserva ceros iniciales, fecha de Excel, teléfono y curso seleccionado en III Ciclo',()=>{
  const [entry]=studentImportPreview([{...sample,fecha_nacimiento:new Date('2013-01-15T00:00:00Z')}],mapping,database(),2027);
  expect(entry.errors).toEqual([]);
  expect(entry.row.student.identification).toBe('000123456');
  expect(entry.row.student.birthdate).toBe('2013-01-15');
  expect(entry.row.student.phone).toBe('+506 8888-0000');
  expect(entry.row.enrollment.year).toBe(2027);
  expect(entry.row.enrollment.status).toBe('Inactivo');
});

it('conserva el subgrupo y la especialidad de Diversificada',()=>{
  const [entry]=studentImportPreview([{...sample,nivel:10,seccion:'3',subgrupo:'B',especialidad:'Inteligencia Artificial'}],mapping,database(),2027);
  expect(entry.errors).toEqual([]);
  expect(entry.row.enrollment.subgroup).toBe('B');
  expect(entry.row.enrollment.specialty).toBe('Inteligencia Artificial');
});

it('sigue aceptando archivos anteriores sin teléfono y permite la ubicación pendiente',()=>{
  const [entry]=studentImportPreview([{identificacion:'DEMO90001',nombre:'Persona',primer_apellido:'Ejemplo',nivel:9}],mapping,database(),2027);
  expect(entry.errors).toEqual([]);
  expect(entry.row.student.phone).toBe('');
  expect(entry.row.enrollment.grade).toBe(9);
  expect(entry.row.enrollment.section).toBe('');
});

it('detecta duplicados, grupos distintos y teléfonos inválidos antes de importar',()=>{
  const entries=studentImportPreview([sample,{...sample,telefono_estudiante:'123',subgrupo:'C'}],mapping,database(),2027);
  expect(entries[0].errors).toEqual([]);
  expect(entries[1].errors.join()).toMatch(/duplicada/);
  expect(entries[1].errors.join()).toMatch(/teléfono del estudiante/);
  expect(entries[1].errors.join()).toMatch(/grupo no está configurado/);
});
