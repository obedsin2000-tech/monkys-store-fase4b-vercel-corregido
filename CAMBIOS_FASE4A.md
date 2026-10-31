# Cambios Fase 4A

- Nueva migración no destructiva `004_fase4a.sql`.
- Revisión de ejecución anónima de funciones existentes del esquema public.
- RPC admin-only `phase4a_security_report` (lectura y diagnóstico).
- Índices para auditoría y consulta de administradores.
- Página de seguridad en `/seguridad` y enlace de menú admin.
- Cabeceras HTTP de protección básica en Next.js.
- Respaldo manual Windows a archivo pg_dump custom + lectura pg_restore --list y hash SHA256.
- Herramienta independiente de comprobación del backup.
- Diagnóstico local sin revelar claves.
- Guía detallada para usuarios sin experiencia técnica.

**No incluido:** restauración automática, copia de archivos Storage, respaldo en segundo plano, códigos de barras ni integración WhatsApp/Shalom.
