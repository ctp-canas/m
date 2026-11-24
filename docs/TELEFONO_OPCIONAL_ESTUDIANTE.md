# Teléfono opcional del estudiante

24 de noviembre de 2026.

Se agregó el campo «Teléfono del estudiante (opcional)» al registro y edición de expedientes. Puede permanecer vacío. Cuando se proporciona, admite entre 8 y 15 dígitos y formato con código de país, espacios, paréntesis o guiones.

El número aparece en la revisión final, en los datos generales del expediente y en la sección de contacto del estudiante de la constancia existente. Es independiente del teléfono de la persona encargada.

Se reutiliza `public.students.details.phone`, que se guarda y recupera mediante los RPC existentes. No se requiere una migración ni una carga o modificación masiva de estudiantes. Los expedientes anteriores que no incluyen `phone` siguen siendo válidos y el acceso conserva las políticas existentes.

Se probaron el campo vacío y ausente, los formatos admitidos, la validación del dato proporcionado y su guardado, lectura y eliminación en una base de pruebas con las migraciones completas. Se verificó que este cambio no altere encargados ni matrículas.

También se comprobó el guardado, la lectura y el campo vacío mediante los RPC del proyecto Supabase, con una transacción revertida al finalizar. No se conservaron registros ficticios.
