# Pruebas de aceptación — Fase 1

**Requisito:** trabajar primero en un proyecto Supabase de prueba con prendas y usuarios ficticios. No ejecutar sobre tu inventario real hasta completar todas las pruebas.

Marcar una casilla solo después de comprobar el resultado en la web **y en las tablas de Supabase**.

- [ ] **A1. Acceso:** se puede crear usuario, confirmar email, activar admin y acceder.
- [ ] **A2. Permisos:** un operador activo ve productos, crea reservas y confirma ventas; no puede crear productos, recibir compras o ajustar stock (RPC debe rechazar aunque se invoque manualmente).
- [ ] **A3. Producto:** crear CAS-001 con talla M negra y cantidad 10 produce `on_hand=10`, `reserved=0` y movimiento `initial +10`.
- [ ] **A4. Variante:** agregar talla L conserva la talla M y registra stock de cada SKU por separado.
- [ ] **A5. Precio:** cambiar precio/mínimo de un SKU no modifica stock ni movimientos históricos.
- [ ] **A6. Compra:** recibir 4 unidades a costo 60 incrementa el físico en 4 y agrega UN movimiento `purchase +4`.
- [ ] **A7. Costo promedio:** con 10 unidades a costo 40 y 10 nuevas a costo 50, el promedio resulta 45, si no hay salidas intermedias.
- [ ] **A8. Reserva:** reservar 3 de 10: físico 10, reservado 3, disponible 7, sin salida de Kardex.
- [ ] **A9. Confirmación:** confirmar la reserva de 3: físico 7, reservado 0, salida Kardex -3; una segunda confirmación debe fallar.
- [ ] **A10. Cancelación:** cancelar una reserva de 2 libera las 2 unidades disponibles sin crear movimiento físico.
- [ ] **A11. Vencimiento:** reserva de 5 minutos se marca `expired` tras vencer y acceder a Pedidos, y libera unidades.
- [ ] **A12. Stock negativo:** intentar reservar o vender más que el disponible debe fallar sin registrar pedido.
- [ ] **A13. Concurrencia:** dos sesiones intentan comprar la última unidad simultáneamente: una gana y otra falla (verificar en Supabase, no solo en UI).
- [ ] **A14. Doble clic/reintento:** repetir exactamente el `request_key` de una venta no crea una venta duplicada (probar RPC con la misma clave).
- [ ] **A15. XLSX válido:** importa dos variantes de un mismo código de producto y registra entradas iniciales.
- [ ] **A16. XLSX inválido:** un SKU duplicado en archivo provoca error y **ninguna** de sus filas se guarda.
- [ ] **A17. Clientes:** registrar cliente y seleccionarlo al vender funciona.
- [ ] **A18. Dashboard:** las ventas de hoy coinciden con los pedidos confirmados del día en hora peruana.
- [ ] **A19. Cerrar sesión:** al salir, no puede abrirse el panel sin autenticarse.
- [ ] **A20. Respaldo:** crear un backup, restaurarlo en entorno independiente y verificar catálogo, pedidos y movimientos.

## Resultado

Fecha de prueba: __________

Entorno / URL: __________

Pruebas superadas: ____ / 20

Fallos detectados y correcciones: __________

**No declarar apta para producción una instalación que no supere el conjunto de pruebas pertinente.**
