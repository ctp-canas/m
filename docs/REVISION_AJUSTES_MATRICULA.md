# Revisión de ajustes de matrícula · CTP Cañas

6 de noviembre de 2026 · Versión para revisión local con datos ficticios.

## Cambios y archivos

| Área | Resultado | Archivos |
|---|---|---|
| Informes | La sección pasa al encabezado si el listado abarca una sola. En listados mixtos se conserva la columna Sección. La organización separada crea bloques con encabezado propio dentro de un mismo PDF o libro de Excel. | `src/App.tsx`, `src/report-layout.ts`, `src/reports.ts`, `src/sheets.ts` |
| Lista personalizada | Solicita motivo y fecha. Permite elegir sección completa o limitar la lista a un subgrupo o especialidad. Incluye numeración por lista, identificación, nombre y espacio para firma. | `src/App.tsx`, `src/reports.ts` |
| Tipografía | Aumento de 1 px en pantalla. El cuerpo de las tablas del PDF se conserva en 8 pt. | `src/styles.css`, `src/App.tsx` |
| Registro | Revisión final con los datos ingresados y alta manual como Activo. Los expedientes existentes conservan sus documentos y la posibilidad de revisarlos. Las importaciones siguen ingresando como Inactivo. | `src/App.tsx`, `src/lib/supabase.ts` |
| Cupo | Hasta 35 activos por curso, nivel y sección. El límite es compartido por los grupos. Los excesos históricos se conservan y bloquean nuevas incorporaciones hasta liberar espacio. | `src/domain.ts`, `src/App.tsx`, `supabase/migrations/20261106120000_section_capacity_and_manual_registration.sql` |
| Estadísticas | Vistas Tabla y Gráficos con filtros compartidos, orden, totales, detalle y exportación. El indicador de cupo muestra la ocupación activa real de cada sección, incluso al filtrar por estado. | `src/statistics-page.tsx`, `src/App.tsx`, `src/styles.css` |
| Pruebas | Cobertura de los grupos, capacidad, deduplicación y registro transaccional. Los datos ficticios de una instalación nueva se reparten entre A y B. | `tests/domain.test.ts`, `tests/database.test.ts`, `tests/reports-statistics.test.ts`, `src/seed.ts` |

## Migración y reversión

- **Aplicación.** En una base de pruebas independiente con PostgreSQL 15 o posterior, aplique las migraciones en orden. La actualización agrega el origen del registro, conserva el estado de los expedientes existentes e inicializa el contador de la sección a partir de sus matrículas activas. El contador interno se actualiza en la misma transacción. Un traslado que se rechaza no consume cupo en el destino ni lo libera en el origen.
- **Registro institucional.** La función `register_manual_enrollment` exige permisos de escritura de estudiantes y confirmación de matrícula. Conserva las políticas de acceso de las tablas involucradas. La llamada, el expediente y su matrícula activa se completan en una sola transacción. El cliente institucional queda preparado para llamar la función.
- **Reversión.** El SQL de `supabase/rollback/` restaura las reglas anteriores y conserva estudiantes, matrículas, estados y documentos. Retira las columnas de origen y ubicación incorporadas por esta actualización. Si ya existen varias especialidades en una misma sección, la reversión se detiene para evitar pérdida de datos. Haga un respaldo y revise la compatibilidad con la interfaz antes de revertir.

## Resultados de pruebas

| Prueba | Resultado |
|---|---|
| Suite automatizada con Vitest e IndexedDB/PGlite | 60 pruebas aprobadas. |
| Compilación con TypeScript y Vite | Correcta. Vite avisa que dos paquetes compilados superan 500 kB antes de compresión. |
| PostgreSQL 18 local, dos conexiones independientes | Con 34 activos, una conexión ocupó el último cupo en A. La otra esperó y fue rechazada al intentar ocuparlo en B. Quedaron 35 activos y ningún expediente parcial. |
| Traslados y reversión en PostgreSQL 18 local | Se admitió el movimiento interno en sección llena, se bloqueó el traslado hacia una sección llena y se comprobó la reutilización del cupo liberado. La reversión y reaplicación conservaron las matrículas y reconstruyeron el contador. |
| Navegador | Alta manual activa, revisión final, informe mixto con columna Sección, lista de una sección sin dicha columna y cuadro de elección por subgrupo. |
| Archivos exportados | PDF carta de dos páginas con motivo, fecha, subgrupos A y B y columna Firma. Excel de estadísticas con filtros y valores contrastados con la pantalla. |
| Pantallas | Se revisó el panel en escritorio y la vista de estadísticas a 390 px y 768 px, sin desbordamiento horizontal de la página. |

## Cómo revisar localmente

1. Extraiga el ZIP y abra la carpeta `ctp-canas-matricula` en una terminal con Node.js 22 o posterior. Ejecute `npm ci` y `npm run dev`. Abra la dirección que indique Vite.
2. En **Estudiantes**, registre un expediente ficticio y seleccione un grupo con espacios. Revise el resumen y confirme. Compruebe que el expediente aparece al filtrar por estado **Activo** y que el total se actualiza.
3. En **Informes institucionales**, abra **Lista personalizada de estudiantes**, indique motivo y fecha y seleccione **7-1**. Genere un PDF con listas separadas. Luego elija un solo subgrupo para comprobar su encabezado.
4. En **Organización académica**, compruebe el cupo de la sección. En **Estadísticas**, aplique filtros y alterne entre **Tabla** y **Gráficos**.
5. Ejecute `npm test` y `npm run build` para repetir las comprobaciones automatizadas y compilar.

## Pendiente antes de uso institucional

La interfaz de pruebas sigue trabajando con IndexedDB y datos ficticios. La integración de la interfaz con Supabase, la autenticación, los permisos reales y el almacenamiento privado de fotografías y documentos requieren un entorno institucional independiente. La migración se probó en PostgreSQL local y queda pendiente aplicarla y validarla en ese entorno. La publicación para uso institucional queda pendiente de aprobación.
