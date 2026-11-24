import {expect,it} from 'vitest';
import {blankStudent,validateStudent} from '../src/domain';
import {seed} from '../src/seed';

function student(){return {...blankStudent(),identification:'QAPHONE01',name:'Persona',surname1:'De Prueba'}}
it('permite registrar estudiantes sin teléfono, incluidos expedientes anteriores',()=>{
  const value=student();
  expect(validateStudent(value,seed())).toEqual([]);
  delete value.phone;
  expect(validateStudent(value,seed())).toEqual([]);
});
it('acepta un teléfono nacional o con código de país y formato legible',()=>{
  for(const phone of ['88880000','8888-0000','+506 8888-0000','(506) 8888 0000']){
    expect(validateStudent({...student(),phone},seed())).toEqual([]);
  }
});
it('valida únicamente los teléfonos que se proporcionan',()=>{
  for(const phone of ['123','sin teléfono','1234567890123456']){
    expect(validateStudent({...student(),phone},seed()).join()).toMatch(/teléfono del estudiante/);
  }
  expect(validateStudent({...student(),phone:'   '},seed())).toEqual([]);
});
