// Run only against a separate TEST project. Values are read from environment, never arguments.
import {createClient} from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,password=process.env.ADMIN_TEMP_PASSWORD;
if(!url||!key||!password||password.length<12)throw Error('Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y ADMIN_TEMP_PASSWORD (12 caracteres mínimo).');
if(!process.env.ADMIN_IDENTIFICATION)throw Error('Configure ADMIN_IDENTIFICATION.');
if(process.env.CONFIRM_TEST_PROJECT!=='yes')throw Error('Se requiere CONFIRM_TEST_PROJECT=yes para confirmar que el proyecto es de pruebas.');
const client=createClient(url,key,{auth:{persistSession:false}}),email=`${crypto.randomUUID()}@accounts.ctp-canas.invalid`;
const {data,error}=await client.auth.admin.createUser({email,password,email_confirm:true});if(error)throw Error('No se pudo crear la cuenta. Revise si ya existe; no se ha cambiado ninguna contraseña.');
const {error:linkError}=await client.rpc('provision_account',{target:data.user.id,identity_number:process.env.ADMIN_IDENTIFICATION,email_address:email,account_name:'Administrador institucional',rights:['*']});
if(linkError){await client.auth.admin.deleteUser(data.user.id);throw Error('No se pudo vincular el administrador. Se revirtió la cuenta nueva.');}
console.log('Administrador creado. El cambio de contraseña inicial es obligatorio.');
