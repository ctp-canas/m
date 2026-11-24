# Plantilla de importación masiva

La plantilla descargable contiene la hoja `Estudiantes`, con doce encabezados reconocidos por el importador, y una hoja `Guía` con instrucciones y ejemplos ficticios. La primera hoja queda vacía para evitar importar ejemplos accidentalmente.

Los tres campos obligatorios son `identificacion`, `nombre` y `primer_apellido`. El teléfono del estudiante se importa mediante `telefono_estudiante` y es opcional. Se conservan los subgrupos de III Ciclo y Diversificada y las matrículas ingresan inactivas en el curso seleccionado.

Las fechas pueden ser valores de fecha de Excel o texto AAAA-MM-DD. La identificación y el teléfono tienen formato de texto para conservar ceros y códigos de país. Se incluyen listas de género, sección y subgrupo y validación de nivel. Cada archivo admite hasta 3000 estudiantes y 5 MB.

Para ubicar estudiantes, configure primero los grupos y especialidades del curso. Si deja la ubicación pendiente, deje sección, subgrupo y especialidad vacíos. Los grupos deben coincidir exactamente con la configuración de la plataforma.

Se verificaron el archivo con el lector real de la plataforma, los encabezados, la ausencia de filas ficticias importables, las fechas, los teléfonos, los subgrupos de Diversificada, los duplicados y la compatibilidad con archivos anteriores sin teléfono. No se importaron estudiantes en producción.
