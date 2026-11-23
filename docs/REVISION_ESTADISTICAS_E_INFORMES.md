# Revisión de estadísticas, informes y PDF

Colegio Técnico Profesional de Cañas  
6 de noviembre de 2026 · Entrega para pruebas locales

## Cambios realizados

| Área | Resultado | Componentes principales |
|---|---|---|
| Estadísticas | Tablero dividido en **Resumen general**, **Estadísticas detalladas** y **Estadísticas personalizadas**. Presenta matrícula activa, ocupación y cupos, niveles, secciones, género y especialidades. Los filtros de curso, nivel, sección y especialidad se aplican a la consulta. | `statistics-page.tsx`, `statistics-scope.ts`, `gender-statistics.ts`, `gender-statistics-panel.tsx`, `styles.css` |
| Consultas personalizadas | Permiten definir la población, elegir variables, configurar el análisis y seleccionar un formato. Incluyen conteos, porcentajes, promedios, mínimos y máximos, frecuencias, comparaciones y cruces compatibles. Se pueden exportar a Excel y PNG o preparar un PDF con la tabla, el gráfico o ambos. | `custom-statistics.ts`, `custom-statistics-builder.tsx`, `custom-chart.tsx`, `statistics-export.ts` |
| Hoja de datos del estudiante | La ficha para el expediente usa las imágenes institucionales de encabezado y pie del resto de los informes. Conserva la fotografía y los campos existentes, utiliza papel carta y agrega numeración de páginas. | `enrollment-certificate.ts`, `certificate-preview.tsx`, `pdf-preview.tsx` |
| Procedencia de sétimo | Incluye solo estudiantes activos del curso y sección elegidos. Ordena por apellidos, muestra la procedencia guardada y usa «No registrado» si el campo está vacío. Los informes de una sola sección trasladan la sección al encabezado. La plantilla de importación incluye la columna de procedencia como campo opcional. | `origin-report.tsx`, `reports.ts`, `App.tsx` |
| Tipografía PDF | Todos los generadores comparten un único componente para registrar las dos variantes de Arial, reservar espacio para encabezados y pies y numerar páginas. El sistema valida la familia, el peso, las restricciones de incrustación declaradas por el archivo y la cobertura de caracteres del español. | `institutional-pdf.ts`, `pdf-fonts.ts`, `pdf-font-settings.tsx`, `reports.ts` |

Las rutas indicadas corresponden a la carpeta `src/`. Los cambios utilizan `students.previous_school` y los campos de matrícula existentes. Esta revisión no requiere una migración de base de datos.

## Criterios de cálculo

- Las consultas generales usan matrícula activa por defecto. Las consultas de género y los cruces que lo incluyen usan matrícula activa aun si se seleccionó otro estado.
- El recuento deduplica por estudiante dentro del curso consultado. Los porcentajes se calculan sobre el total de la población filtrada. Las edades inválidas quedan fuera del promedio y el histograma, y el resultado indica cuántas edades válidas se utilizaron y la fecha de referencia.
- La capacidad se calcula con el cupo institucional de 35 y la matrícula activa de cada sección completa incluida. Un filtro de subgrupo o especialidad selecciona las secciones que se deben considerar. El denominador sigue siendo el cupo completo de cada sección.
- Los gráficos de alta cardinalidad se limitan a combinaciones legibles. La tabla y Excel conservan todos los datos agregados.

## Verificación

| Prueba | Resultado |
|---|---|
| Suite de regresión | 77 pruebas automatizadas aprobadas. |
| Compilación | TypeScript y Vite completaron la compilación. Vite informa sobre el tamaño de dos paquetes JavaScript. |
| Navegador | Se verificaron el resumen, el género activo al filtrar matrículas inactivas, la tabla cruzada, el histograma, el informe de sétimo, la vista previa de la hoja y el aviso para configurar Arial. Se revisó el constructor en escritorio, teléfono y tableta. |
| Exportación | El Excel de la tabla cruzada coincidió con los 273 estudiantes de la vista de prueba. El Excel de procedencia incluyó las 11 matrículas ficticias activas de la sección 7-1. El histograma PNG conservó el título y el alcance de la consulta. |
| Datos | Se confirmó la lectura de `previous_school` de una matrícula ficticia nueva en la base PostgreSQL aislada que usa la suite. |
| Maquetación de PDF | Se revisaron en carta la hoja con fotografía de prueba, el informe de procedencia paginado con nombres largos y la tabla estadística. Para esas pruebas de geometría se usó la fuente abierta del proyecto mediante un doble de prueba. |

## Pendientes para validación

- El entorno no disponía de archivos Arial autorizados. Para probar la incrustación real, configure el recurso Arial autorizado en el alojamiento según la [guía de despliegue](despliegue.md). El generador lo carga automáticamente al crear el informe. La vista previa de datos y las exportaciones a Excel y PNG se pueden usar antes de cargar las fuentes. La emisión de PDF queda deshabilitada hasta configurarlas.
- La integración institucional con Supabase sigue pendiente. La aplicación de pruebas usa datos ficticios guardados en el navegador. El paquete está preparado para revisión local.

## Inicio de pruebas

1. Extraiga el ZIP y abra la carpeta `ctp-canas-matricula` en una terminal con Node.js 22 o posterior.
2. Ejecute `npm ci` y `npm run dev`. Abra la dirección local que muestre Vite.
3. En **Estadísticas → Estadísticas personalizadas**, seleccione **Nivel académico**, **Tabla cruzada** y **Género** como agrupación. Pruebe la tabla, las barras apiladas, Excel y PNG.
4. En **Informes institucionales**, abra **Estudiantes de sétimo año por centro educativo de procedencia** y cambie entre todas las secciones y una sección específica.
5. En **Estudiantes**, abra un expediente ficticio y seleccione **Hoja de datos del estudiante**. Con el recurso Arial disponible en el alojamiento, compare la vista previa y la descarga del PDF. Repita la comprobación para un informe y para una estadística con tabla y gráfico.
