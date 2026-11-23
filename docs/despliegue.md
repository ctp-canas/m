# Publicación futura — procedimiento preparado

**No ejecutar sin autorización explícita y sin resolver el informe de pruebas.**

1. Complete la integración institucional con un proyecto de Supabase independiente y ejecute las pruebas pendientes.
2. Valide el esquema, RLS, Auth, funciones, buckets privados y permisos. Efectúe las revisiones institucionales de datos y autorizaciones aplicables.
3. Configure un entorno de producción separado, con usuarios y secretos propios.
4. Revise el código y confirme que no contiene expedientes reales, secretos ni contraseñas temporales.
5. Ejecute `npm ci`, `npm run typecheck`, `npm test`, `npm audit` y `npm run build`.
6. Vite usa `base: './'` y navegación por hash, compatible con la ruta de un repositorio GitHub Pages. Pruebe los archivos y las fuentes bajo la ruta exacta del repositorio.
7. Configure los orígenes/redirects exactos autorizados en Supabase y el origen de las funciones.
8. Documente evidencia de todas las comprobaciones de seguridad y restauración.
9. Obtenga autorización explícita del propietario para publicar.
10. Solo entonces prepare el flujo manual de publicación, con un entorno protegido cuando el plan lo permita, y active GitHub Pages.

El flujo actual de GitHub Actions no publica. No se ha creado ningún workflow que active Pages al hacer push. La integración continua solo comprueba el proyecto.

Este proyecto se conserva en Sites como una versión sin despliegue. Su URL esperada no debe confundirse con un sitio publicado.


## Tipografía automática de informes

En la preparación del sitio, el equipo técnico debe proveer **Arial regular TrueType** con autorización para su alojamiento web e incrustación editable o instalable en PDF, incluidos subconjuntos. La aplicación usa esa fuente automáticamente en todos los informes y gráficos descargables. Las hojas Excel declaran Arial en su formato.

Para un archivo con licencia de alojamiento propio, colóquelo como `public/fonts/arial-regular.ttf` antes de compilar. La ruta relativa funciona también en el subdirectorio de GitHub Pages. Si el recurso está alojado en otra ubicación autorizada, configure `VITE_PDF_ARIAL_REGULAR_URL` en el entorno de Vite. Configure `VITE_PDF_ARIAL_BOLD_URL` solo cuando disponga de Arial negrita autorizado. Una URL en otro origen debe permitir su lectura mediante CORS desde el sitio. Mantenga estas rutas libres de credenciales.

Las fuentes licenciadas no se incluyen en el repositorio ni en el ZIP de revisión. En la prueba de aceptación abra una hoja individual, un informe y un PDF de estadísticas. Verifique que `pdffonts` identifica Arial y lo marca como incrustado. Si el recurso falta o no pasa la validación, el informe muestra un aviso y omite la descarga. No existe un formulario de fuentes para el personal.
