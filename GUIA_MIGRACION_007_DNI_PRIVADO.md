# Migraciones 007 y 008 — DNI de envíos privado

El cambio se aplica en dos etapas para que la aplicación siga funcionando durante el despliegue. La migración 007 crea una función SQL de lectura exclusiva para administradores y ajusta el guardado para que un operador no borre un DNI ya registrado. Tras desplegar el código, la migración 008 retira el permiso de lectura directa de esa columna.

## Antes de ejecutar

- Confirma que las migraciones 001 a 006 ya están aplicadas. El panel de seguridad debe mostrar 21/21 tablas.
- Descarga un respaldo de la base de datos.
- No vuelvas a ejecutar las migraciones 001 a 006.

## Aplicación

1. En Supabase abre **SQL Editor** y crea una consulta nueva.
2. Copia todo el contenido de `supabase/migrations/007_dni_envios_privado.sql` y ejecútalo una sola vez con el rol `postgres`.
3. Publica el código de la rama y confirma que el panel y los rótulos funcionan.
4. Ejecuta `supabase/migrations/008_dni_envios_permisos.sql` una sola vez con el rol `postgres`.

## Comprobación manual

- Entra como administrador: el campo DNI debe seguir disponible para el envío, y los rótulos/CSV con DNI deben funcionar.
- Entra como operador: el formulario no debe mostrar DNI y los rótulos/CSV sin DNI deben seguir funcionando.
- Como operador, guarda un envío que ya tenía DNI: el DNI debe conservarse sin quedar visible en pantalla.
- Tras ejecutar 008, un operador autenticado no debe poder seleccionar la columna `shipments.dni` directamente.

La migración no cambia los DNI existentes ni elimina información. Mantiene la auditoría y las transiciones de envío actuales.
