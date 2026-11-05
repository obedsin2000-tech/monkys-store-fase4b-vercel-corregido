# Aplicar las correcciones de integridad del ERP

La aplicación corregida registra las recepciones mediante `receive_purchase_once`. Por eso hay que aplicar **009 antes de desplegar esta rama**. Las funciones utilizadas por la versión anterior siguen disponibles durante la actualización.

1. Conserva un respaldo comprobado de la base actual y realiza primero el procedimiento en una base de pruebas.
2. En Supabase, abre el proyecto correcto y entra en **SQL Editor → New query**, con el rol `postgres`.
3. Ejecuta completo [supabase/migrations/009_integridad_operativa.sql](supabase/migrations/009_integridad_operativa.sql), después de las migraciones 001 a 008. El resultado esperado es `Success`.
4. Comprueba la instalación con esta consulta de solo lectura:

```sql
SELECT
  to_regprocedure('public.receive_purchase_once(uuid,uuid,text,jsonb)') IS NOT NULL AS recepcion_instalada,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='purchases' AND column_name='request_key'
  ) AS clave_instalada,
  NOT has_function_privilege('anon','public.receive_purchase_once(uuid,uuid,text,jsonb)','EXECUTE') AS acceso_anonimo_bloqueado;
```

Las tres columnas deben devolver `true`.

5. Despliega la rama revisada mediante su pull request. Si Vercel crea una vista previa antes de este paso, úsala con una base que ya tenga 009.
6. En la base de pruebas, comprueba una recepción, una reserva con adelanto y saldo, y un envío desde el guardado hasta la entrega. El informe incluye el detalle de las comprobaciones automáticas y manuales.

## Impacto de 009

| Cambio | Efecto en registros existentes |
|---|---|
| Validación explícita de valores nulos en las funciones de negocio | Conserva los registros y rechaza nuevas solicitudes incompletas. |
| Bloqueos para claves de solicitud y filas de pedido/envío | Serializa reintentos y cambios de estado relacionados. |
| Columna nullable `purchases.request_key` e índice único parcial | Las compras anteriores conservan `NULL`; no se recalculan cantidades ni importes. |
| Nueva función `receive_purchase_once` | Registra la compra una vez por clave; un reintento idéntico devuelve la misma compra. Rechaza la reutilización de una clave con otros datos. |
| Misma transición de envío repetida | Conserva el estado y las fechas originales, evitando registrar otra transición. |
| Permisos | Conserva RLS y la restricción de DNI. La nueva función exige administrador y bloquea ejecución anónima. |

La migración usa `BEGIN`/`COMMIT`. No borra tablas ni modifica saldos, pagos, stock o DNI ya guardados. Las pruebas incluyen aplicarla sobre datos ficticios existentes y repetirla, comprobando su conservación.

No repitas las migraciones 001 a 008. Si 009 produce un error, conserva el mensaje y revisa la transacción antes del despliegue. No elimines datos para completar la instalación.
