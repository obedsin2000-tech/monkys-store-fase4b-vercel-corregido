# Actualización Fase 4B · colas y seguridad

La versión incluye una migración adicional: `supabase/migrations/006_fase4b_operaciones.sql`.
No repitas las migraciones 001 a 005. Esta migración agrega índices de búsqueda y amplía el diagnóstico de seguridad para incluir las dos tablas de conteo de Fase 4B.

## Aplicación

1. Verifica que Fase 4B ya esté instalada y que exista un respaldo reciente. Conserva una copia fuera de la laptop y activa el cifrado del disco o de la carpeta donde guardes respaldos.
2. En Supabase abre **SQL Editor → New query** y selecciona el rol `postgres`.
3. Abre `supabase/migrations/006_fase4b_operaciones.sql`, copia todo su contenido y ejecútalo una vez.
4. Abre el ERP como administrador y entra a **Seguridad y respaldos**. La sección debe reportar 21 tablas protegidas; cualquier alerta requiere revisión antes de usar datos reales.

La migración no cambia ventas, precios, existencias, reservas ni datos de clientes. Si falla, guarda el error y no borres ni reinicies tablas.

## Respaldo

El script `04_CREAR_RESPALDO.bat` restringe los permisos de la carpeta local `Monkys_Backups` al usuario actual, `SYSTEM` y administradores de Windows. Esto evita accesos casuales desde otras cuentas; no sustituye el cifrado del dispositivo ni una copia cifrada fuera del equipo.

`pg_restore --list` confirma que el archivo se puede leer, pero no que se restaure correctamente. Programa una restauración de ensayo en una base Supabase separada y respalda Supabase Storage por separado: las imágenes y documentos no forman parte del archivo PostgreSQL.
