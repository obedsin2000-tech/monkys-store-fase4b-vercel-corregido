# PRUEBAS DE ACEPTACIÓN - FASE 4A

**No probar ventas reales ni restauración sobre la base de producción.**

1. Verificar copia de la carpeta Fase 3 intacta.
2. Realizar respaldo antes de migrar; archivo de tamaño no trivial y `pg_restore --list` sin error.
3. Verificar que `004_fase4a.sql` termina sin errores al ejecutarse como `postgres`.
4. Verificar `SELECT to_regprocedure('public.phase4a_security_report()') IS NOT NULL;` devuelve true.
5. Entrar como admin y abrir `/seguridad` sin error.
6. Verificar 19 tablas evaluadas y 19/19 con RLS activo / sin SELECT anónimo.
7. Verificar 0 funciones SECURITY DEFINER con permiso anónimo.
8. Verificar que UPDATE directo a variants, orders, profiles está negado a authenticated.
9. Entrar como operador y confirmar que no se muestra el enlace y el servidor bloquea el RPC de diagnóstico.
10. Consultar últimas 15 entradas de auditoría sin revelar sus datos internos.
11. Cerrar sesión y comprobar redirección al inicio de sesión.
12. Comprobar que no se creó nueva cuenta ni otra base de datos.
13. Comprobar stock, pedidos, caja y reportes con datos conocidos sin variaciones accidentales.
14. Abrir `04_CREAR_RESPALDO.bat` y comprobar que no graba claves en archivos.
15. Comprobar que una credencial incorrecta NO genera archivo .backup válido.
16. Verificar la copia creada mediante `05_VERIFICAR_RESPALDO.bat`; comparar SHA256.
17. Confirmar por separado si existen archivos de Supabase Storage que requieran exportación.
18. Probar recuperación **solo en una base aislada** con supervisión antes de declarar recuperación validada.

**Criterio de aceptación:** el panel no informa falsamente de un backup automático; se conservan operaciones Fases 1-3; ninguna tabla comercial queda sin RLS; no existe acceso anónimo a RPC sensibles; y se dispone de respaldo externo comprobado.
