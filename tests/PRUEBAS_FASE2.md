# Pruebas de aceptación — Fase 2

**Ejecútalas con datos de prueba y revisa saldos de `variants` y `stock_movements`.** No fueron ejecutadas por el autor contra una Supabase real en esta sesión.

1. **Migración:** antes de 002, existen tablas F1 y órdenes. Después de 002, existen 7 nuevas tablas y los registros F1 permanecen.
2. **Histórico:** cada orden previamente confirmada tiene exactamente un asiento de cobro F1 (importe total), sin nueva salida de inventario.
3. **Pago parcial:** pedido reservado S/100, pago S/30: sigue reservado, `payment_status='partial'`, 70 pendientes, no movimiento físico.
4. **Pago final:** segundo pago S/70: `confirmed`, `paid`, una sola salida por línea en Kardex, stock reservado liberado.
5. **Idempotencia:** reenviar mismo `request_key` en `record_payment` no crea otro cobro.
6. **Sobrepago:** intentar cobrar S/80 con saldo S/70 devuelve error; no cambia nada.
7. **Expiración con adelanto:** reserva con abono no se vence ni libera unidades por la función `expire_reservations`.
8. **Expiración sin adelanto:** reserva vencida sin pagos se libera y pasa a `expired`.
9. **Cancelación con abono:** no se permite cancelación simple; administrador registra reembolso completo y cancela, liberando reserva.
10. **Envíos:** registrar datos, preparar, despachar solo orden confirmada y entregar; no editar envío ya despachado.
11. **Rótulo:** imprimir un pedido y varios; comprobar que los nombres no se mezclen. Guardar PDF desde navegador.
12. **Exportación:** archivo CSV contiene datos correspondientes y no ejecuta fórmulas si un campo comienza con =, +, - o @.
13. **Devolución vendible:** aumenta físico y disponible una vez.
14. **Devolución dañada:** aumenta físico y bloqueado; disponible no cambia.
15. **Límite devolución:** devolver más unidades que las vendidas falla sin efectos parciales.
16. **Reembolso:** se registra solo cuando se entrega efectivamente el dinero y no supera la venta ni las unidades devueltas.
17. **Reembolso diferido:** devolver producto con reembolso S/ 0. Luego registrar un reembolso parcial desde Reembolsos pendientes y verificar el saldo restante. Intentar exceder el saldo debe fallar.
18. **Doble clic en devolución:** mismo `request_key` no duplica movimiento ni reembolso.
19. **Gasto:** monto negativo o cero rechazado. Gasto válido modifica total neto del reporte.
20. **Caja:** suma cobros - reembolsos - gastos en zona America/Lima.
21. **Corte:** efectivo esperado = apertura + efectivo recibido - efectivo reembolsado - gastos en efectivo. Segundo corte del mismo día falla; pagos posteriores siguen permitidos, pues es instantánea.
22. **Roles:** operador no puede registrar gastos, devoluciones ni cortes; servidor niega RPC aunque se invoque manualmente.
23. **Seguridad:** usuarios no autenticados no pueden consultar envíos, DNI, pagos ni exportar CSV.
24. **Regresión F1:** crear venta pagada directa por formulario original genera un pago de caja y una sola salida de stock; confirmar reserva mediante botón original también.
25. **Rollback antes de operar:** ante fallo SQL, la transacción revierte completa; conserva el respaldo y contacta soporte antes de reintentar.
