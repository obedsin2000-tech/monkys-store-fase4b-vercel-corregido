# Monky's Store — Pruebas de aceptación de la Fase 3

> Estas son pruebas que deben ejecutarse en tu copia de Supabase con DATOS FICTICIOS. No significa que ya se hayan ejecutado aquí.

## Requisitos previos
- Migraciones 001, 002 y 003 aplicadas, en orden.
- Iniciar sesión con una cuenta administrador.
- Guardar un respaldo comprobable de la base de datos y una copia de la carpeta Fase 2.

## Checklist funcional
- [ ] **F3-01**: En `/reportes`, cambiar fechas y observar que los KPIs cambian. Período vacío muestra 0, no datos inventados.
- [ ] **F3-02**: Confirmar un pedido de prueba por S/ 100 hoy. Debe aumentar ventas confirmadas y el número de pedidos de hoy.
- [ ] **F3-03**: Registrar S/ 30 de adelanto en una reserva diferente. Debe aumentar cobros, pero NO ventas confirmadas.
- [ ] **F3-04**: Recibir pago restante para confirmar esa reserva. Ventas se registra al confirmarse; NO vuelve a contarse el adelanto como un cobro nuevo.
- [ ] **F3-05**: Registrar una devolución apta para venta. Debe figurar el valor devuelto y reducir utilidad bruta estimada conforme a costo histórico.
- [ ] **F3-06**: Registrar reembolso un día distinto. El movimiento monetario pertenece al día del pago, y el valor de la prenda devuelta al de su devolución.
- [ ] **F3-07**: Verificar que la suma por canales coincide con las ventas brutas del mismo periodo (cuando las ventas están correctamente clasificadas).
- [ ] **F3-08**: Inventario: stock físico, reservado y bloqueado coinciden con la página de Kardex; el valor del inventario refleja costo promedio, no precio de venta.
- [ ] **F3-09**: Comprar prendas de un proveedor de prueba y revisar el reporte de proveedores; total/unidades/recepciones correctas.
- [ ] **F3-10**: Descargar Excel `.xlsx` y CSV; comprobar encabezados, fechas, campos y ausencia de errores de fórmula.
- [ ] **F3-11**: Como administrador, activar un usuario nuevo operador desde `/equipo` y comprobar acceso al panel.
- [ ] **F3-12**: Como operador, intentar acceder directamente a `/reportes` y a `/api/reportes/exportar?seccion=products`. Los reportes económicos deben estar bloqueados.
- [ ] **F3-13**: Como operador, intentar cambiar el rol de alguien: el servidor debe rechazarlo.
- [ ] **F3-14**: Como administrador, intentar desactivar o degradar tu propia cuenta: debe rechazarlo.
- [ ] **F3-15**: Confirmar en `audit_events` que cambiar los permisos genera un registro.
- [ ] **F3-16**: Seleccionar un rango de más de 366 días o fechas futuras: el sistema debe mostrar error.
- [ ] **F3-17**: Probar reportes con muchas ventas y variantes; comprobar que el total general NO depende de las primeras 1,000 filas del cliente.
- [ ] **F3-18**: Probar el menú de reportes en celular, la tabla desplazable y la exportación.

## Interpretaciones financieras importantes
- Las **ventas confirmadas** se agrupan por fecha de confirmación (hora de Perú).
- Los **cobros** se agrupan por fecha de pago recibido (hora de Perú), aunque el pedido sea anterior.
- El **valor de las devoluciones** se agrupa por fecha de devolución y según el valor de las líneas originalmente vendidas.
- La **utilidad bruta estimada** es ventas menos valor de devoluciones, menos costo histórico vendido, más el costo de las devoluciones aptas para venta. No equivale a beneficio neto ni contabilidad tributaria.
- Las unidades vendidas de la tabla de rotación son brutas dentro del periodo; el stock disponible y valor son al momento actual.

Si una prueba falla, no pongas esta fase en producción. Captura error y revisa el módulo antes de usar datos reales.
