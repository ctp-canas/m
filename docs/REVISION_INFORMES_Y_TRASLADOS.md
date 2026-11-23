# Revisión de informes y traslados

## Uso en Sites o en una revisión local

1. Instale las dependencias con `npm ci` y ejecute `npm run dev`.
2. En **Configuración → Configuración de informes**, cargue o reemplace el encabezado y el pie de forma independiente. Puede ocultar cada imagen o restaurar el recurso institucional original. Se admiten PNG y JPEG de hasta 2 MB y 4096 × 4096 píxeles. En pruebas, las preferencias se conservan en el navegador.
3. Abra la vista previa de un informe. El sitio carga Arial regular automáticamente desde su configuración técnica. Arial negrita es opcional y se limita a títulos y encabezados. El personal no necesita cargar fuentes.
4. En **Informes institucionales → Informe de traslados de estudiantes**, seleccione el curso y, cuando corresponda, el rango de fechas, nivel y sección. Puede descargar Excel o abrir el PDF para imprimir o descargar el mismo documento que aparece en la vista previa.

El generador compartido reserva espacio para ambas imágenes en formato carta, mantiene sus proporciones y las repite en cada página. Los informes incorporan la selección vigente al preparar un PDF nuevo.

## Historial y permisos

La aplicación conserva un evento por cada transición a **Traslado**, con fecha efectiva, curso, nivel, sección, nombre y cédula. Corregir la fecha del traslado vigente actualiza ese evento. Cambiar el estado posteriormente conserva el historial. Los eventos se ordenan por fecha y, para fechas iguales, por nombre. Los eventos antiguos sin fecha efectiva verificable quedan fuera del informe. Si la fecha es verificable y el nivel de ese momento no se puede confirmar, el informe indica «No registrado».

La migración `20261106200429_report_artwork_and_transfer_history.sql` amplía el historial existente y crea la vista de informes y las preferencias de imágenes. No actualiza matrículas ni elimina estudiantes o archivos. Crea un bucket privado con referencias que cambian al reemplazar una imagen. El permiso `configuration.write` permite gestionar imágenes. El informe institucional de traslados exige `reports.read` y `students.read`.

Para la prueba institucional se requiere aplicar las migraciones en orden en un proyecto Supabase de pruebas, disponer del flujo existente `login-by-id` y una cuenta habilitada con contraseña definitiva, y configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Con esas variables se habilita el acceso institucional a estas dos funciones. La gestión general de expedientes de esta revisión continúa en IndexedDB. La migración de traslados registra cambios efectuados sobre matrículas en Supabase cuando esas operaciones se realizan en la base institucional.

## Verificación

- **Sites, datos ficticios.** Carga de PNG y JPEG, reemplazo y persistencia del encabezado, ocultación y restauración del pie, registro de un traslado, filtros de nivel y sección, descarga en Excel y requisito de Arial en la vista previa. Vista de informe revisada en escritorio, teléfono de 390 px y tableta de 768 px.
- **Pruebas automatizadas.** Historial y corrección de fecha, ausencia de duplicados, consultas de años y fechas, permisos SQL y metadatos de Storage en PGlite, y regresiones de certificados, informes y estadísticas.
- **PDF de prueba.** Documento carta de cuatro páginas con encabezado, pie y cabeceras de tabla repetidos. Se comprobó la proporción de las imágenes y el texto con tildes y ñ. La prueba de composición usa una fuente de prueba y se mantiene separada del requisito de Arial del producto.
- **Pendiente antes de aprobar el uso institucional.** Verificar el inicio de sesión, Storage y consultas con cuentas de un Supabase de pruebas. Proveer el recurso Arial autorizado en el alojamiento y comprobar la fuente incrustada en los PDF finales y la impresión física.

La revisión no se ha desplegado ni se han aplicado migraciones a servicios remotos.
