# Publicación institucional en GitHub y Supabase

## Implementado

- Conexión de los expedientes, matrículas, cursos, grupos y configuración a Supabase.
- Inicio de sesión por cédula y contraseña, activación por correo y cambio obligatorio de contraseña temporal.
- Usuarios administradores y personal de matrícula con permisos comprobados en el servidor.
- Base inicial sin estudiantes, matrículas, especialidades, cursos ni grupos.
- Máximo de 34 estudiantes activos por sección y 17 por subgrupo o especialidad dentro de cada sección.
- Creación del primer curso y asignación de especialidades desde la interfaz.
- Conservación de traslados y de la identidad de grupos con matrículas.
- Guardado atómico con revisión para impedir sobrescrituras entre computadoras.
- Flujo GitHub Actions de pruebas, compilación y publicación en Pages.

## Validación

Pasaron 90 pruebas automatizadas. Las pruebas usan bases efímeras independientes. Se verificaron el arranque vacío, los permisos de lectura y escritura, el cupo 18 del subgrupo, el cupo 35 de la sección, el cupo compartido por especialidad, las revisiones de guardado y las regresiones de informes y estadísticas.

En el proyecto Supabase de matrícula se consultaron los conteos iniciales y se confirmó que las tablas de estudiantes, matrículas, especialidades, cursos y grupos estaban vacías.

Los avisos informativos de tablas privadas sin políticas corresponden a tablas internas con denegación por defecto y acceso de servicio o funciones restringidas.

## Pendientes de cierre

- Repositorio público `ctp-canas/m` creado y Pages configurado para GitHub Actions.
- Verificar el despliegue del flujo y la URL final.
- Instalar Arial autorizado para alojamiento e incrustación antes de validar la descarga final de PDF.
- Completar la prueba del primer ingreso por correo y la impresión desde el sitio publicado.
