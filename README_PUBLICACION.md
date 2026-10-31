# Monky's Store ERP — Preparación para Vercel

**Paquete revisado**: Fase 4B, octubre de 2026. Conserva las funciones de fases anteriores. No requiere migración adicional ni otra base Supabase. **Estado**: revisado estáticamente, pendiente de compilar e integrar con Supabase. **No está desplegado aún**.

## Cómo empezar — Windows 11 (sin conocimientos de programación)

1. Extrae este ZIP en una carpeta nueva. Mantén tu Fase 4B anterior y un respaldo de Supabase, por seguridad.
2. Abre **01_REVISAR_ANTES_DE_PUBLICAR.bat**. Instala las dependencias y ejecuta una compilación de producción (`npm run build`). Si falla, no publiques: comparte solo el mensaje de error, sin claves ni datos personales.
3. Al completar la compilación, comprueba que existe `package-lock.json` y **conserva ese archivo**. Permite que Vercel instale exactamente las dependencias que se probaron.
4. Con [GitHub Desktop](https://desktop.github.com), crea un repositorio **privado** desde esta carpeta y publícalo. Comprueba que `.env.local`, respaldos, contraseñas y archivos personales **no** aparecen en los cambios que se enviarán.
5. En [Vercel](https://vercel.com/new), importa el repositorio, selecciona Next.js, deja `npm run build` y el directorio raíz (no uses `/app` como Root Directory).
6. Antes de pulsar **Deploy**, en **Environment Variables**, agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con los valores de tu `.env.local` anterior. **Sólo Production** si todavía no tienes Supabase de pruebas; no conectes los despliegues Preview al inventario real.
7. Publica por primera vez y anota la dirección HTTPS que asigne Vercel (por ejemplo `https://nombre.vercel.app`, no está reservada).
8. En Vercel → Settings → Environment Variables, agrega `NEXT_PUBLIC_SITE_URL` con **tu dirección HTTPS real** (sin `/auth/callback`). Selecciona **Production**. Realiza un nuevo despliegue para aplicar el cambio.
9. En Supabase → Authentication → URL Configuration, establece la URL del sitio (**Site URL**) al HTTPS de Vercel. En **Redirect URLs** agrega `https://TU_DOMINIO.vercel.app/auth/callback`. Mantén `http://localhost:3000/**` sólo si seguirás usando la versión local de pruebas. Evita redirecciones con comodines amplios en producción.
10. Prueba ingreso del administrador, acceso negado sin sesión, creación de producto ficticio, reservas, etiquetas y exportaciones con información de prueba. Verifica las cuentas de operador y permisos, y confirma que la producción no esté accesible sin inicio de sesión.

### Antes de publicar para uso comercial

- Para Monky's Store no utilices Vercel Hobby: su licencia se limita a uso no comercial. Verifica un plan adecuado, por ejemplo Pro, y los costos vigentes.
- **No pegues** una cadena de conexión PostgreSQL, contraseña, API `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni `sb_secret_...` en variables `NEXT_PUBLIC_` ni en GitHub.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` o la nueva clave publicable son públicas por diseño: la seguridad depende de Supabase Auth, permisos y RLS.
- En producción, evalúa desactivar el registro público desde Supabase Authentication una vez que hayas creado y habilitado las cuentas de trabajadores.
- Confirma que la migración `005_fase4b.sql` ya se ejecutó en tu base. **No vuelvas a ejecutar 001–005 sólo por desplegar en Vercel.**
- Prepara recuperación: un respaldo local que pueda restaurarse en una base de pruebas. **Subir a Vercel no es un respaldo.**

### Diagnósticos sencillos

| Situación | Qué revisar |
|---|---|
| `Build Failed` | Vercel → Deployment → Build Logs. Ejecutar `01_REVISAR_ANTES_DE_PUBLICAR.bat` localmente. |
| Página en blanco o error Supabase | En Vercel, nombres exactos y valores de las dos variables. Crear nuevo despliegue después de cambiar variables. |
| Confirma el correo pero vuelve a localhost | Supabase → Authentication → URL Configuration y `NEXT_PUBLIC_SITE_URL`. |
| Puedes iniciar sesión, pero no entrar al panel | Tabla `profiles`: usuario `active=true` y rol correcto. Verificar que el proyecto Supabase sea el de siempre. |
| Error de alguna tabla o función | Confirmar que la base corresponde a Fase 4B. No ejecutar migraciones a ciegas. |
| El PDF/CSV no se descarga | Comprobar el inicio de sesión y Vercel → Runtime Logs. |

Consulta la **GUIA_PUBLICACION_VERCEL.pdf** para instrucciones visuales ampliadas y el **INFORME_REVISION.md** para conocer las verificaciones realizadas y sus límites.
