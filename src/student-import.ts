import {blankStudent,blankEnrollment,validateStudent,normalize,type Row,type State} from './domain';

export const studentImportFields=[
  ['identificacion','Identificación *'],['nombre','Nombre *'],['primer_apellido','Primer apellido *'],
  ['segundo_apellido','Segundo apellido'],['fecha_nacimiento','Fecha de nacimiento'],['genero','Género'],
  ['nivel','Nivel'],['seccion','Sección'],['subgrupo','Subgrupo'],['especialidad','Especialidad'],
  ['centro_educativo_de_procedencia','Centro educativo de procedencia'],['telefono_estudiante','Teléfono del estudiante (opcional)'],
] as const;
export type ImportEntry={row:Row;errors:string[];line:number};
export function studentImportPreview(raw:Record<string,unknown>[],mapping:Record<string,string>,db:State,year:number):ImportEntry[]{
  const seen=new Set(db.students.map(s=>normalize(s.identification)));
  return raw.map((item,i)=>{
    const value=(key:string)=>String(item[mapping[key]]??'').trim();
    const student=blankStudent(),enrollment=blankEnrollment(student.id,year,db.settings.documents);
    student.previousSchool=value('centro_educativo_de_procedencia');
    student.identification=value('identificacion');student.name=value('nombre');
    student.surname1=value('primer_apellido');student.surname2=value('segundo_apellido');
    const rawDate=item[mapping.fecha_nacimiento];
    student.birthdate=rawDate instanceof Date?rawDate.toISOString().slice(0,10):value('fecha_nacimiento');
    student.gender=value('genero')||'No indicado';student.phone=value('telefono_estudiante');
    const errors=validateStudent(student,db);
    const level=value('nivel');enrollment.grade=level?Number(level):7;
    enrollment.section=value('seccion');enrollment.subgroup=value('subgrupo');
    enrollment.specialty=enrollment.grade>=10?value('especialidad'):'';
    if(![7,8,9,10,11,12].includes(enrollment.grade))errors.push('Nivel inválido.');
    if(student.birthdate&&!/^\d{4}-\d{2}-\d{2}$/.test(student.birthdate))errors.push('Use fecha AAAA-MM-DD.');
    if(student.birthdate&&Number.isNaN(Date.parse(student.birthdate)))errors.push('Fecha de nacimiento inválida.');
    if(seen.has(normalize(student.identification)))errors.push('Identificación duplicada en la base o en el archivo.');
    seen.add(normalize(student.identification));
    if(enrollment.section&&!db.groups.some(g=>g.year===year&&g.grade===enrollment.grade&&g.section===enrollment.section&&g.subgroup===enrollment.subgroup&&g.specialty===enrollment.specialty))errors.push('El grupo no está configurado.');
    return {row:{student,enrollment},errors,line:i+2};
  });
}
