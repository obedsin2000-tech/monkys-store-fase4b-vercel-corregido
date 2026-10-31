# Cambios de la Fase 4B

## Módulos nuevos
- `/etiquetas`: lista de variantes, códigos internos Code 128, impresión masiva 50×30 y 40×25 mm.
- `/inventario/conteos`: apertura, conteo físico por escáner USB, registro por SKU, envío y aprobación del administrador.

## Módulos ampliados
- `/ventas`: el escáner añade una unidad al carrito sin confirmar venta.
- `/compras`: el escáner selecciona SKU y costo a revisar; confirma recepción manual.
- `/productos`: muestra código interno de cada variante.
- `/inventario`: accesos a conteo y etiquetas.
- `components/shell.tsx`: accesos de Fase 4B.

## Migración independiente
- `supabase/migrations/005_fase4b.sql`: `variants.barcode`, secuencia de códigos únicos, `stock_revision`, `inventory_counts`, `inventory_count_lines` y cinco RPC de gestión de conteos.
- Sin borrado de tablas ni cambio inicial de existencias. Los ajustes solo ocurren tras aprobación explícita.
- Requiere 004 instalada y respaldo validado.

## Calidad y límites
- 63 archivos TypeScript/TSX inspeccionados con parser; 0 errores sintácticos.
- Pruebas del patrón Code 128 y checksum realizadas en Node.js.
- No se completó compilación full Next.js ni pruebas con Supabase en este entorno: falta instalar dependencias y conectar a una base real.
- Verifica lectura física con impresora/escáner y pruebas del Kardex antes de producción.
