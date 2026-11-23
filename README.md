# Matrícula · CTP Cañas

Gestión institucional en español. Los expedientes se consultan y guardan en Supabase con autenticación por cédula, permisos y transacciones. La instalación inicia sin estudiantes, matrículas, especialidades, cursos ni grupos.

## Preparación

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`.

La configuración pública de Supabase está en `.env.production`. Las claves de servicio permanecen en Edge Functions. Los archivos Arial autorizados para alojamiento web e incrustación en PDF deben estar en `public/fonts/arial-regular.ttf` o configurarse mediante `VITE_PDF_ARIAL_REGULAR_URL`. El sistema los carga automáticamente.

## Primer ingreso

La cuenta administradora inicial se vincula por correo verificado mediante una autorización guardada únicamente en la base privada. Use **Activar cuenta o recuperar acceso** en la pantalla de ingreso. Después de verificar el correo, establezca su contraseña personal. El ingreso habitual utiliza cédula y contraseña.

1. Cree el primer curso en **Cursos lectivos**.
2. Agregue las especialidades en **Configuración**.
3. Asigne las especialidades a los grupos de 10°, 11° y 12° en **Organización académica**.
4. Registre o importe los estudiantes.

Cada sección tiene un máximo de **34** matrículas activas. Cada subgrupo y cada especialidad dentro de esa sección tiene un máximo de **17**. La base verifica ambos límites, también con escrituras concurrentes. Los grupos que tengan matrículas conservan su ubicación para proteger el historial.

## Publicación

El flujo de GitHub Actions verifica, compila y publica `dist` mediante GitHub Pages. La navegación por hash y la base relativa de Vite permiten usar una ruta corta de repositorio, por ejemplo `/m/`. Debe habilitarse GitHub Pages con origen **GitHub Actions**. Nunca incluya copias de estudiantes ni credenciales privadas en el repositorio.

Consulte [el registro de preparación](docs/PUBLICACION_GITHUB_SUPABASE.md).
