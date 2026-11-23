# INFORME FINAL DE PRUEBAS — SISTEMA DE MATRÍCULA CTP CAÑAS

**Versión:** 0.1.0 — primera entrega funcional de pruebas locales.  
**Fecha:** 4 de noviembre de 2026, America/Costa_Rica.  
**Estado final: NO APTO PARA PUBLICACIÓN.**

## Alcance y resultado

Se construyó la aplicación React/TypeScript con identidad institucional y módulos de gestión local sobre IndexedDB, exclusivamente con información ficticia. Se preparó la base normalizada de Supabase, RLS y funciones de autenticación como código; la interfaz institucional multiusuario no está conectada ni terminada.

Supabase rechazó la creación del proyecto independiente de pruebas porque la cuenta alcanzó el límite de dos proyectos gratuitos activos. No se modificaron los proyectos de admisión y bitácora. El frontend permanece sin desplegar y GitHub Pages no se activó.

| Verificación automatizada | Resultado |
| --- | --- |
| Pruebas funcionales y PostgreSQL embebido | 55 ejecutadas, 55 aprobadas, 0 fallidas |
| Archivos de pruebas | 2 aprobados |
| TypeScript | Aprobado |
| Compilación estática Vite | Aprobada |
| Auditoría npm tras actualizar dependencias | 0 vulnerabilidades conocidas reportadas |

Los resultados corresponden al código de esta entrega, no a una certificación de seguridad institucional.

## Módulos probados

### Reglas y persistencia de pruebas

Edad, estados de póliza y umbral configurable, pasaporte con un solo apellido, duplicados sin distinguir mayúsculas, fechas inválidas/futuras, matrículas nuevas inactivas, separación de cursos, preparación sin promoción automática, preservación del historial, exclusión de retiros/traslados, verificaciones, encargado principal, documentos rechazados, estado médico, cierre de curso, cupos, activación, fecha y responsable, subtotales estadísticos, orden de apellidos, CSV con comillas/saltos/separador, IndexedDB y detección de escrituras desactualizadas.

### PostgreSQL y RLS locales

Se aplicaron las migraciones a PostgreSQL embebido PGlite, con tablas Auth y metadatos Storage simulados. Se verificó:

- RLS en todas las tablas públicas del esquema.
- Usuario sin permiso sin acceso; lector con acceso explícito y sin permiso de escritura.
- Información médica restringida y acceso de administrador explícito.
- Bloqueo por cambio de contraseña pendiente y desactivación inmediata de la cuenta.
- Correspondencia identificación/email y desbloqueo de contraseña inaccesibles al cliente.
- Unicidad de identidad y matrícula anual; curso cerrado y nueva matrícula activa rechazados.
- Confirmación completa mediante RPC y rechazo de expedientes incompletos o sin cupo.
- Eventos/auditoría generados por la base e inmutabilidad de auditoría para el cliente.
- Límite de intentos consecutivos de login en la función SQL.
- Tres buckets configurados como privados y políticas que restringen datos médicos y escritura documental.

**Límite:** no se ejecutaron Supabase Auth, el gateway REST, Edge Functions ni el servicio Storage reales. No se probaron carreras concurrentes entre conexiones reales, sesiones, archivos, enlaces firmados ni efectos de revocación de tokens. Las pruebas embebidas no sustituyen esas validaciones.

## Revisión manual en navegador

| Caso | Resultado observado |
| --- | --- |
| Panel de escritorio | Identidad institucional, tarjetas, gráfico y alertas visibles |
| Búsqueda por identificación | Solo mostró DEMO00001 |
| Verificación incompleta | Botón de activación bloqueado e inconsistencias visibles |
| Guardar doce verificaciones | Progreso conservado |
| Editar documentos y autorización | Cambios guardados |
| Confirmar expediente ficticio completo | Pasó a Activo y el pendiente bajó de 29 a 28 |
| Recargar después de activar | El estado Activo se conservó |
| PDF | Descarga correcta; formato 612 × 792 puntos (carta), encabezado/pie, total, curso y número de página; primera página renderizada e inspeccionada |
| Excel | Archivo abierto con ExcelJS; encabezados y fila coincidieron con el filtro |
| Duplicado en registro manual | Identificación existente rechazada |
| Pasaporte con un solo apellido | Borrador guardado como matrícula pendiente |
| Importación CSV con duplicado | 2 válidos importados, 1 duplicado excluido; ambos nuevos inactivos |
| Teléfono | Menú y formulario operables en marco de 390 × 844 |
| Tableta | Panel visible en marco de 768 × 1024 |
| Desbordamiento horizontal del panel | Ancho de documento igual al área disponible (375 px teléfono; 753 px tableta, descontando barra de desplazamiento) |

Son comprobaciones manuales puntuales, no cobertura completa de accesibilidad, dispositivos físicos o todos los navegadores.

## Funcionalidad pendiente o sin validar

1. Crear y configurar el proyecto de Supabase exclusivo de pruebas.
2. Completar el mapeo y conexión entre la interfaz local y las entidades normalizadas del adaptador institucional.
3. Ejecutar Auth por identificación, cambio inicial, alta/baja de usuarios, permisos individuales y reset administrativo contra el backend real.
4. Agregar y verificar la experiencia institucional de inicio de sesión y expiración/inactividad de sesión.
5. Revisar las funciones Edge con herramientas Deno y pruebas reales de abuso, tamaños de solicitud y límites de intentos; validar errores sin enumeración.
6. Probar concurrencia y capacidad con múltiples conexiones/usuarios; revisar la política de reconfirmación al modificar datos de un expediente ya activo.
7. Integrar fotografías y archivos con Storage privado, enlaces autorizados de corta duración, validación y auditoría de descargas. La fotografía local de pruebas no usa Storage.
8. Completar la carga y ajuste administrativo de imágenes de plantillas. Las imágenes adjuntas ya se incorporan al informe y pueden revisarse en Configuración.
9. Extender los filtros a todos los criterios del documento maestro (subgrupo, especialidad, adecuación, póliza y demás). Los filtros principales implementados son curso, texto, nivel, sección y estado.
10. Ampliar el generador personalizado con agrupación, orden configurable y plantillas de filtros completas; las columnas y plantillas locales sí están implementadas.
11. Completar actualización controlada de registros existentes, historial detallado y descarga de errores de importación. Actualmente los duplicados se excluyen y la operación queda registrada en auditoría local.
12. Ampliar alertas de inconsistencias avanzadas, documentos rechazados, cupos y todos los eventos solicitados.
13. Validar PDF multipágina, listas médicas restringidas, autorizaciones y todos los reportes específicos; se verificó un listado filtrado de una página y su Excel.
14. Verificar restauración local completa desde un respaldo y diseñar/probar respaldo y restauración de Supabase y objetos Storage según el plan elegido.
15. Incorporar permisos reales de exportación y auditoría de lecturas sensibles. La auditoría local registra cambios, no es un control inalterable.
16. Revisión formal de accesibilidad, navegación solo con teclado, rendimiento con grandes volúmenes y dispositivos físicos.
17. Validar base path y autenticación en la ruta definitiva de GitHub Pages sin publicarlo; actualmente la compilación usa rutas relativas y navegación por hash.
18. Revisión institucional de requisitos, privacidad, autorizaciones, retención, acceso médico y recuperación antes de introducir información real.

## Hallazgos y correcciones

La revisión inicial de npm encontró paquetes con avisos de seguridad. Se sustituyó el lector de hojas de cálculo y se actualizaron los paquetes afectados; la auditoría final no reporta vulnerabilidades conocidas. Se corrigió la inicialización duplicada de IndexedDB en modo estricto de React y la presentación de grupos sin asignar.

La compilación emite avisos de tamaño para dependencias de gráficos/exportación. PDF y Excel se cargan bajo demanda; se recomienda medir rendimiento con la población y conectividad reales antes de habilitar el uso institucional.

## Decisión de salida

**NO APTO PARA PUBLICACIÓN.** La versión permite revisar y probar los flujos locales construidos. No debe emplearse con información real ni asumirse que cumple todas las funciones del documento maestro. La conexión institucional y las pruebas de seguridad de los servicios reales son bloqueantes.

Ni un resultado satisfactorio de pruebas locales ni guardar una versión en Sites autoriza publicar. La publicación requiere resolver los pendientes críticos y una instrucción expresa del propietario.
