# Instalación institucional

El proyecto requiere Node.js 22 y Supabase. Las migraciones se aplican en orden y no contienen estudiantes ni especialidades de ejemplo. Los datos de prueba están aislados en las suites automatizadas.

La cuenta administradora se autoriza por correo en una tabla privada. Su activación exige verificar ese correo y establecer una contraseña personal. Los usuarios posteriores se crean desde Usuarios y permisos.

La configuración del frontend utiliza únicamente la URL y clave publicable. Las claves privilegiadas permanecen en las funciones de Supabase.
