# Reportes y análisis de Monky’s Store

Implementación sobre `ee16f78a` (paleta grafito + ámbar). Conserva Next.js, React, Supabase, ExcelJS y los criterios financieros de las migraciones 003 y 010. El gráfico amplía el componente propio; no se agregaron dependencias.

## Activación

1. Mantén aplicadas las migraciones 001 a 010.
2. Ejecuta **`supabase/migrations/011_reportes_analisis.sql`** en el editor SQL de tu proyecto Supabase, como propietario.
3. Recarga **Reportes y análisis** como administrador.

011 crea funciones de lectura y sus permisos. No cambia pedidos, pagos, devoluciones, inventario ni registros históricos. Se probó su ejecución repetida sin alterar datos. El nuevo RPC exige administrador activo; los auxiliares no son ejecutables directamente por `anon` ni `authenticated`.

Mientras falte 011, las tres pestañas anteriores siguen funcionando con un aviso de activación. Un error de conexión no activa esta compatibilidad ni se transforma en ceros.

## Hallazgos comprobados

| Hallazgo | Impacto | Evidencia y resolución |
| --- | --- | --- |
| El gráfico descartaba los primeros días de rangos de más de 31 días. | Alta: representación incompleta del período. | `DailyBars` usaba `slice(-31)`. Ahora usa todos los días y agrupa por duración. |
| Una barra positiva tenía un mínimo artificial del 2%. | Media: proporción visual inexacta. | Se eliminó el mínimo; barras y eje parten de cero. |
| El margen admitía una base de ventas netas negativa. | Media: porcentaje difícil de interpretar. | Se muestra margen solo si las ventas netas son positivas; cero y valores negativos tienen explicación. |
| Productos, inventario y proveedores tenían límites fijos de 200/500/200 registros, también en sus archivos. | Media: consulta y exportación limitadas. | Listas paginadas; exportación completa de los filtros hasta 10 000 filas, con rechazo explícito si se supera el límite. |
| Las compras sin proveedor no tenían fila en el análisis por proveedor. | Media: recepciones excluidas de ese desglose. | Se incluye “Sin proveedor registrado”, conciliable con sus recepciones. |
| No había operaciones de respaldo para cada cifra ni comparación equivalente. | Mejora de consulta. | Detalles paginados, contexto por canal/variante/proveedor y período anterior de igual duración. |

La revisión **no encontró doble descuento en el cálculo existente**: `orders.total` y `order_lines.line_total` ya contienen el precio acordado. Se conserva ese criterio y se añade la rebaja documentada como información independiente.

## Definiciones conservadas y aclaradas

| Indicador | Definición |
| --- | --- |
| Ventas confirmadas | Líneas de pedidos confirmados por `confirmed_at`, después de descuentos. No usa la fecha de creación para reconocer la venta. |
| Descuentos registrados | `(precio original conservado − precio acordado) × cantidad`, al confirmar. No se vuelven a restar. Las líneas antiguas sin precio original se identifican como información no disponible. |
| Devoluciones valorizadas | Precio neto histórico proporcional de las unidades recibidas, por fecha de devolución. Incluye ventas de otros períodos. |
| Ventas netas estimadas | Ventas confirmadas menos devoluciones valorizadas del período. |
| Costo histórico neto | Costo conservado en las líneas vendidas menos costo de devoluciones aptas para vender. El costo promedio actual no sustituye el histórico. |
| Utilidad bruta estimada | Ventas menos devoluciones y costo vendido, más costo recuperado de prendas aptas para vender. Una devolución dañada no recupera costo. No descuenta gastos. |
| Margen bruto | Utilidad bruta estimada / ventas netas, solo con base positiva. |
| Cobros | Movimientos por `received_at`, incluidos adelantos y saldos de pedidos de otros períodos. |
| Reembolsos | Movimientos efectivamente pagados por `refunded_at`, incluidos adelantos devueltos por cancelación. |
| Gastos | Registros por `occurred_at`, separados de utilidad bruta. |
| Flujo neto registrado | Cobros menos reembolsos y gastos. No es utilidad neta, caja disponible ni saldo bancario. Su alcance son los módulos registrados; no incluye pagos a proveedores que no existan en estos datos. |
| Pendientes de cobro | Saldo actual de reservas vigentes o con adelanto, no saldo histórico al cierre del período. |
| Stock y valorización | Existencias actuales; disponible = físico − reservado − bloqueado. Valor = físico × costo promedio actual, incluyendo bloqueado. |
| Stock bajo | Variantes activas con disponible menor o igual al mínimo. |
| Con stock y sin ventas | Variantes activas con disponible positivo y sin unidades vendidas confirmadas en el período. No demuestra por sí solo ausencia de demanda. |
| Compras por proveedor | Recepciones por fecha de recepción. No representan compras pagadas ni deuda. |

No se inventan saldos por proveedor, rotación contable o cobertura: faltan pagos/cuentas por pagar e inventario promedio histórico verificable.

## Uso y presentación

- Cuatro indicadores principales: ventas netas, utilidad bruta, cobros y flujo neto. Cada uno tiene período, explicación, comparación y detalle.
- Períodos rápidos y rango personalizado de 1 a 366 días, ambos días incluidos, en America/Lima. Se rechazan fechas futuras en servidor y base de datos.
- Comparación con los días inmediatamente anteriores de igual duración. Si el último día está en curso, el período anterior se corta a la misma hora local. No se calcula variación porcentual con base cero o negativa.
- Gráfico diario hasta 31 días; intervalos consecutivos de hasta siete días hasta 120 días; meses para rangos mayores. La selección muestra las fechas exactas del intervalo.
- Eje en soles, base cero, series estables grafito/ámbar, importes por foco/teclado/tacto, enlaces separados para ventas y cobros y tabla alternativa accesible.
- Canales con totales, participación, orden y operaciones. Productos ordenables por unidades, importe, utilidad, descuentos o devoluciones.
- Inventario filtrable por texto, stock bajo o ausencia de ventas. Proveedores filtrables con recepciones de respaldo.
- Al aplicar una selección se ocultan los resultados anteriores hasta completar la consulta.

## Conciliación y archivos

`report_analysis` devuelve cada pestaña en una llamada. La fuente privada de operaciones se reutiliza para totales, gráfico y detalles. El corte temporal de las operaciones se conserva en enlaces y exportaciones; existencias y saldos siguen siendo consultas actuales y están identificados como tales.

Excel y CSV incluyen período, moneda, zona horaria, generación, corte, filtros y definiciones. Se conservan las defensas contra fórmulas en texto exportado. CSV identifica filas `dato`, `total` y `sin_registros`, para no confundir un total con otra operación. Los archivos completos no se limitan a la página visible.

La impresión/PDF usa los mismos filtros y totales; imprime la página visible de cada tabla, con total filtrado y subtotal cuando corresponde. Para todas las operaciones debe usarse Excel/CSV. No se presentan páginas parciales como listados completos.

## Archivos principales

- `supabase/migrations/011_reportes_analisis.sql`: fuente de lectura, validaciones, permisos, comparación y paginación.
- `lib/reporting.ts`, `lib/report-analysis.ts`: definiciones, filtros, agrupación, validación de respuestas y acceso al RPC.
- `components/report-pages.tsx`, `report-filters.tsx`, `report-workspace.tsx`, `analysis-chart.tsx`, `mini-bars.tsx`: interfaz y navegación.
- `app/(sistema)/reportes/**/page.tsx`: tres pestañas y nueva ruta de detalle.
- `lib/report-export.ts`, `app/api/reportes/exportar/route.ts`: archivos conciliables.
- `components/reports-legacy-*.tsx`, `lib/report-export-legacy.ts`, `lib/phase3.ts`: compatibilidad mientras se aplica 011 y autenticación compartida por petición.
- `app/globals.css`: estilos adaptables y de impresión con los tokens existentes.
- `tests/erp-reporting.test.mjs`: regresiones financieras, fechas, seguridad, exportación y estados de error.

## Verificaciones ejecutadas

- `npm run typecheck`: correcto.
- `npm run build`: correcto, incluyendo la ruta de detalle. Se usaron variables de ejemplo, sin credenciales reales.
- `npm run test:regression`: **64 pruebas correctas**, 17 nuevas de análisis. PostgreSQL local mediante PGlite con las migraciones reales 001 a 011.
- `node tests/check-phase3.mjs`, `npm run check:fase4a`, `npm run check:fase4b`: correctos; son comprobaciones estáticas con el alcance que indican sus mensajes.
- Casos: descuento una vez, céntimos, costo histórico después de compras, adelantos, pagos parciales, cancelaciones con devolución de adelanto, devolución antigua apta/dañada, reembolso en un período posterior, reservas con saldo, stock filtrado, compras sin proveedor, meses vacíos, base cero/negativa, días límite en Lima, 366 días, paginación, corte compartido, exportación de todas las páginas y rechazo de más de 10 000 filas.
- Seguridad: administrador activo, operador, inactivo, anónimo y acceso directo a auxiliares; migración repetida sin cambios en registros.
- Navegador con páginas reales, datos ficticios y cálculos SQL reales: resultados y capturas en `docs/reportes/`. Se completaron **18 comprobaciones de uso**, 15 revisiones de pantalla/resolución (1440, 1366, 834, 390 y 320 px) y seis auditorías automáticas WCAG A/AA con cero infracciones detectadas. Se comprobó teclado, selección táctil, respuesta de carga, compatibilidad sin 011, denegación al operador, CSV/Excel, orden de canales y PDF. El transporte Supabase se sustituyó únicamente en una copia temporal de prueba.

## Comprobación sencilla después de activar

1. Selecciona un período con ventas y descuentos. Abre **Consultar detalle** de ventas netas y utilidad bruta; compara sus totales con las tarjetas.
2. En **Qué explica el resultado**, consulta descuentos: son informativos y la venta ya está rebajada.
3. Selecciona un intervalo del gráfico. Abre ventas y cobros por separado; comprueba las fechas y el corte.
4. Ordena canales y prendas. Filtra inventario y proveedores. Comprueba que sus totales cambian junto con las listas correspondientes.
5. Descarga Excel/CSV. En un detalle de más de 50 operaciones comprueba que el archivo incluye todas las páginas y el total filtrado.
6. Prueba un período vacío: debe indicar ausencia de actividad; un fallo de conexión debe mostrar un error sin cifras inventadas.

## Límites pendientes

No se ejecutó 011 en tu Supabase ni se revisaron datos de producción: no hay una conexión administrativa disponible en esta sesión. Los cálculos se verificaron con datos de prueba, no con tus resultados reales. Quedan pendientes la aplicación de 011, una conciliación de un período real y la revisión de rendimiento con el volumen real. La accesibilidad automática no sustituye pruebas con lectores de pantalla; la impresión se comprobó en PDF, no con impresora física.
