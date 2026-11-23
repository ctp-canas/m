# Revisión local · Constancia, expedientes y estadísticas

**Colegio Técnico Profesional de Cañas**  
6 de noviembre de 2026

## Cambios y archivos

| Área | Resultado | Archivos principales |
|---|---|---|
| Estado de matrícula | Se retiró la columna de los listados, las vistas previas y las exportaciones de estudiantes. Las plantillas antiguas también omiten esa columna al cargarse. Los filtros, las acciones y el dato de matrícula se mantienen disponibles. | `src/App.tsx`, `src/report-layout.ts`, `src/reports.ts` |
| Constancia | Formulario institucional en carta vertical, con vista previa, descarga y apertura del mismo PDF para imprimir. Usa los datos disponibles y la fotografía del expediente. Si falta una foto, muestra un marco neutro. La fecha de matrícula corresponde a la fecha de confirmación guardada, cuando existe. Los registros pendientes se identifican como tales en la constancia. | `src/enrollment-certificate.ts`, `src/certificate-preview.tsx`, `src/App.tsx`, `src/styles.css` |
| Expediente | Se retiró Documentación tanto de la ficha individual como de su formulario de edición. La revisión de requisitos y sus observaciones se hace en **Matrícula → Control documental**. La verificación de matrícula conserva el acceso a ese módulo. | `src/App.tsx` |
| Género por sección | La tabla, los gráficos agrupado y apilado y la exportación Excel comparten datos y filtros. El filtro inicial es Activo. Se conservan las secciones con cero registros y se distinguen las categorías Otro y No especificado. | `src/gender-statistics.ts`, `src/gender-statistics-panel.tsx`, `src/statistics-page.tsx`, `src/styles.css` |
| Pruebas | Validación del formulario PDF, plantillas anteriores, filtros y recuentos de género. | `tests/certificate-gender.test.ts`, `tests/reports-statistics.test.ts`, `tests/database.test.ts` |

La constancia para archivo contiene identificación, matrícula, domicilio y contactos autorizados. Los datos médicos y las notas administrativas internas se consultan desde sus apartados de acceso correspondiente. El espacio de firma y sello se deja listo para validación del centro educativo.

## Pruebas realizadas

- **68 pruebas automatizadas aprobadas** y compilación de TypeScript y Vite completada. Vite conserva un aviso de tamaño en el paquete principal y ExcelJS.
- El recuento de género por sección coincidió con una consulta SQL de matrículas activas almacenadas en PostgreSQL local con datos ficticios. La prueba cubrió subgrupos distintos dentro de la misma sección, y la suite incluyó filtros de curso, nivel, sección y estado, duplicados y categorías sin dato.
- En el navegador de escritorio se verificaron los encabezados de los listados, la ausencia de la pestaña Documentación, el acceso independiente a Control documental y la descarga de la constancia. Los gráficos se probaron en escritorio, teléfono (390 px) y tableta (768 px).
- Se descargaron y renderizaron dos constancias en papel carta vertical. La primera mostró el marco sin foto. La segunda incrustó la imagen de prueba guardada y mantuvo su proporción original. Se verificó el enlace de impresión al mismo PDF que se ofrece en descarga.
- El archivo Excel exportado desde el tablero incluyó el bloque por género y sección. Los filtros y totales coincidieron con la tabla visible.

## Base de datos y alcance

Estas cuatro correcciones son de interfaz, cálculo y generación de documentos. **No requieren migraciones.** La base y las políticas de acceso existentes se conservan. Las pruebas de esta revisión se hicieron con registros ficticios. La interfaz de pruebas usa IndexedDB y la conexión institucional con Supabase continúa pendiente, por lo que la verificación con expedientes institucionales queda pendiente.

## Cómo revisar

1. Extraiga el ZIP y abra una terminal en `ctp-canas-matricula`. Con Node.js 22 o posterior ejecute `npm ci` y `npm run dev`.
2. Abra la dirección local que muestre Vite. En **Estudiantes**, abra un expediente ficticio y elija **Constancia de matrícula**. Use **Descargar PDF** o **Abrir para imprimir** para revisar la salida. Si necesita probar una fotografía, use una imagen de prueba en **Editar expediente**.
3. Abra **Matrícula → Control documental** para verificar que se puedan revisar los requisitos desde su módulo.
4. En **Estadísticas**, filtre por curso y nivel. Compare la tabla con los gráficos **Agrupado** y **Apilado**, y revise el bloque correspondiente en el archivo Excel.
