# Informe de revisión — Monky's Store ERP Fase 4B para Vercel

Fecha: 30 de octubre de 2026. Fuente: el ZIP original `Monkys_Store_ERP_Fase4B.zip` de la conversación. No modifica las tablas de Supabase.

## Mejoras realizadas en este paquete

1. Añadidas instrucciones de despliegue para usuarios sin experiencia.
2. Actualizada `.gitignore` para no subir `.env`, archivos de contraseña, respaldos ni exportaciones.
3. Añadida `.vercelignore` para excluir archivos de instalación de Windows, respaldos y migraciones del paquete de despliegue.
4. Añadida `.env.example` documentada (sólo marcadores ficticios) con la URL oficial del dominio.
5. Añadida validación estática `npm run check:deployment` y comprobación de formato de variables `npm run check:environment`. No muestran claves.
6. Añadido `01_REVISAR_ANTES_DE_PUBLICAR.bat` para instalar dependencias y ejecutar `npm run build` en Windows. Genera `package-lock.json` si no existe.
7. Añadida `.node-version` (Node 22) y rango de motor en `package.json`.
8. Corregida la redirección de `auth/callback`: utiliza la URL oficial configurada si existe y no redirige a destinos indicados por parámetros de consulta; las respuestas incorporan `Cache-Control: no-store`.
9. Forzada la renderización dinámica del layout privado del ERP.
10. El endpoint de exportación de reportes deja de mostrar literalmente errores internos de la base al cliente.
11. Eliminado un texto obsoleto “Fase 1” de la pantalla de ingreso.

## Verificaciones realizadas

- **Sí**: existencia de componentes, rutas principales, `proxy.ts`, cliente Supabase y migraciones 001 a 005.
- **Sí**: comprobación estática de estructura con `node scripts/check-deployment.mjs`.
- **Sí**: prueba local de lógica Code 128 mediante `node --experimental-strip-types tests/check-phase4b.mjs` (Node 22).
- **Sí**: inspección de que el ZIP de entrega no incorpora `.env.local` ni credenciales reales de usuario.
- **Sí**: revisión manual de la autentificación (`requireUser`, validación de `getClaims`, perfil activo), el `proxy.ts` y protección de las API de reportes.
- **Pendiente**: `npm run build` y `npm run typecheck` completos. El entorno de preparación no consiguió descargar dependencias desde npm; esto **no** prueba que el código compile en Vercel.
- **Pendiente**: auditoría integral de las funciones SQL de privilegios elevados y todas las políticas RLS sobre una base activa.
- **Pendiente**: prueba de inicio de sesión y redirecciones en dominio real, rendimiento, impresión y seguridad con cuentas de prueba.
- **Pendiente**: lockfile `package-lock.json`; se generará con `npm install` en Windows cuando existan las dependencias y se confirmará tras un build correcto.

## Decisión de publicación

**No declarar “apto para producción” hasta obtener una compilación exitosa, comprobar RLS/roles en tu Supabase y superar pruebas de acceso/venta/respaldo con datos ficticios.**

Los archivos SQL se incluyen para referencia y **no deben ejecutarse de nuevo** en la base existente por motivo de despliegue.
