# Corrección del cierre de sesión

23 de noviembre de 2026.

El botón anterior esperaba el cierre remoto e ignoraba el error devuelto por Supabase. Una respuesta HTTP 500 deja las credenciales locales en el SDK utilizado. El formulario tampoco reiniciaba todos los estados de activación y recuperación al salir.

## Cambios

- Acción centralizada para salir desde la barra, el menú de la cuenta y la pantalla de activación.
- Retirada inmediata de expedientes y permisos de la interfaz al solicitar el cierre.
- Cierre de la sesión actual con Supabase; espera máxima de cuatro segundos.
- Limpieza del almacenamiento de autenticación de este proyecto y recarga en la dirección de ingreso sin fragmentos de autenticación o navegación.
- Bloqueo de escrituras tardías de credenciales y de consultas de permisos iniciadas antes del cierre.
- Reinicio de estados de recuperación, activación, mensajes y permisos de informes.
- Sin cambios en datos estudiantiles, contraseñas, roles ni esquemas de base de datos.

## Verificación

Pruebas de cierre normal, error de red, servidor sin respuesta, renovación tardía, almacenamiento bloqueado, cierre desde otra pestaña y reproducción de HTTP 500 con el SDK real.

Si el servidor no responde, se elimina el acceso guardado en este navegador. La aplicación no afirma que la revocación remota se haya completado en ese caso.
