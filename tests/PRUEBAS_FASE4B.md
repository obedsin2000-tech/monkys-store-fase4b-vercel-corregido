# Pruebas de aceptación — Fase 4B

**Usar datos ficticios y una copia de pruebas.** No aprobar conteos reales hasta validar todas las operaciones.

1. Ejecutar `005_fase4b.sql` en una copia de la base: todas las variantes obtienen un `barcode` único que comienza con `MK` y tiene 12 caracteres. Los SKU, precios y saldos no cambian.
2. Crear una variante nueva desde el ERP: recibe automáticamente código distinto y permanente.
3. Imprimir dos etiquetas 50×30 mm y probarlas con lector USB real (configurado para enviar Enter). La lectura debe devolver el texto impreso exactamente.
4. En `/ventas`, escanear una etiqueta: se agrega una unidad al carrito. Repetir: aumenta una unidad sin superar el disponible. **No** debe confirmarse ninguna venta sin pulsar confirmar.
5. Escanear código desconocido: aparece error, el carrito no cambia.
6. En `/compras`, escanear: se selecciona variante, pero la compra **no** se confirma sola; revisar el costo y cantidad.
7. En `/inventario/conteos`, crear sesión y escanear una misma prenda tres veces: cantidad contada de la variante = 3 (no se generan movimientos aún).
8. Corregir manualmente cantidad a 0: debe guardarse como **cero contado**, no como "sin contar".
9. Enviar conteo y abrirlo como operador: no puede aprobar cambios. Un administrador sí puede aprobar.
10. Aprobar un conteo con diferencia: se genera una sola salida o entrada `adjustment`, con `reference_type='inventory_count'`, y no se duplica al reintentar.
11. Antes de aprobar, realizar una venta o reserva que cambie el stock de una variante contada: la aprobación debe rechazarse y no aplicar ningún ajuste parcial.
12. Contar menos unidades que las reservadas+bloqueadas: se rechaza ajuste y los saldos previos permanecen.
13. Cancelar un conteo: no genera cambios de stock y no puede reabrirse para edición.
14. Comparar el respaldo anterior y posterior a la migración: IDs de productos, cantidades, pedidos y clientes se mantienen intactos.
15. Probar la impresión con la escala de impresión al 100%, sin encabezados/pies del navegador; revisar etiquetas y márgenes en la impresora concreta.

**Puerta de salida:** con 15 pruebas aprobadas y respaldo restaurable en entorno separado se puede considerar lista la fase para operación real.
