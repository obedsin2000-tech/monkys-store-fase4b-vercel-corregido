# Cambios Monky's Store ERP — Fase 3

- Corrección SQL 42601: reporte diario de `003_fase3.sql` usa `report_date` en vez de `day` como alias SQL.

## Conservado de Fases 1 y 2
- Inicio de sesión en Supabase y sus permisos existentes.
- Productos, variantes, importación de Excel, inventario, Kardex y recepciones de compras.
- Ventas rápidas, reservas, pedidos, cobros parciales, envíos, rótulos, devoluciones y caja.

## Agregado en Fase 3
- `supabase/migrations/003_fase3.sql`: funciones `report_phase3` y `manage_team_member`, tres índices de búsqueda.
- `/reportes`: resumen gerencial, gráfico diario, ventas por canal y productos más vendidos.
- `/reportes/inventario`: disponibilidad, valorización al costo promedio y unidades vendidas por SKU.
- `/reportes/proveedores`: unidades, recepciones y montos de compra por proveedor.
- `/equipo`: lista de usuarios y cambio de rol/activación, solo para administradores.
- `/api/reportes/exportar`: exportación CSV (UTF-8 BOM, separador `;`) y Excel `.xlsx`.
- Botón "Imprimir / PDF" para usar el cuadro de impresión del navegador.
- Resumen gerencial de últimos 30 días en `/panel` para administradores.
- Instalación simplificada con `01_INSTALAR_FASE3.bat` y `02_INICIAR_MONKYS.bat`.
- `README.md` y guía PDF para Windows 11, más 18 pruebas de aceptación.

## Limitaciones y decisiones
- Los indicadores monetarios son agregados por el servidor, no por las primeras 1,000 filas del navegador.
- Reportes económicos, exportaciones y administración de trabajadores solo para `admin`.
- El informe de inventario muestra hasta 500 SKU; el de productos hasta 200 y el de proveedores hasta 200; totales generales consideran todos los registros.
- No reemplaza un sistema contable tributario ni emite comprobantes SUNAT.
- No incluye asistente de IA.
- No probado en la base Supabase del usuario; falta compilar con dependencias en la computadora del usuario.
