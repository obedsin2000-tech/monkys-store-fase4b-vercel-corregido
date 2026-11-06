# Revisión y correcciones del ERP de Monky's Store

Fecha: 5 de noviembre de 2026, Lima. Versión de partida: `a3b8f7d113e5ebc822da2373927a054bcff25d7a`.

Las correcciones están preparadas para desplegar después de aplicar la migración 009. La revisión y las pruebas utilizaron datos ficticios y bases temporales. No se consultaron ni modificaron pedidos reales ni se copiaron credenciales de producción.

## Proyecto comprobado

- Next.js 16.4.4, App Router, React 19.3.1, TypeScript 5.9.3 y Node.js 24.22.1, según las dependencias instaladas y el archivo de bloqueo.
- Supabase JS 2.118.0 y SSR 0.6.1. Autenticación por cookies, comprobación de sesión y consulta de perfil activo. Roles existentes: administrador y operador.
- PostgreSQL con 21 tablas de negocio protegidas por RLS, según las migraciones. Pedidos, stock, pagos, devoluciones y conteos usan funciones transaccionales; las escrituras directas sobre saldos están restringidas.
- Módulos revisados: catálogo y variantes, venta rápida, pedidos/reservas, compras/proveedores, inventario/Kardex, conteos, clientes, cobros, envíos/rótulos, devoluciones/reembolsos, caja, reportes, usuarios y seguridad.
- Se leyeron README, guías de instalación/migración, pruebas existentes y las instrucciones locales de Next.js. Se revisaron las guías instaladas de acciones del servidor y actualización de componentes.

## Errores confirmados y correcciones

| ID | Gravedad | Qué ocurría y causa demostrada | Corrección y archivos principales |
|---|---|---|---|
| A01 | Alta | Un `NULL` SQL hacía que condiciones `IF ... NOT IN (...)` y comparaciones sobre JSON resultaran desconocidas. Se reprodujeron pedidos pagados sin líneas, compras vacías, una reserva con tipo nulo que descontaba stock físico sin reservarlo y pagos registrados como efectivo al faltar el método. | Validación explícita de nulos, tipos y tamaños antes de escribir. Migración `009_integridad_operativa.sql`: `create_order`, `confirm_reservation`, `receive_purchase`, `record_payment`, `process_return`. |
| A02 | Alta | Las recepciones carecían de una clave para deduplicar solicitudes. Un doble envío o un reintento tras perder la respuesta podía aumentar stock dos veces. Además, una clave de venta reutilizada con otro carrito devolvía el pedido anterior sin advertir la diferencia. | Nueva recepción con clave estable, índice único, bloqueo de transacción y comprobación de datos al reintentar. Las ventas rechazan claves reutilizadas con otros datos. `components/purchase-form.tsx`, `lib/actions.ts`, migración 009. |
| A03 | Alta | Si fallaba `admin_get_shipment_dni`, el editor administrativo recibía DNI vacío. Guardar los demás campos podía sobrescribir el DNI real con `NULL`. Se reprodujo el fallo de lectura mediante transporte simulado. | Se bloquea el editor cuando falla la consulta protegida o faltan sus filas. `app/(sistema)/envios/page.tsx`. Los operadores continúan sin leer ni borrar DNI. |
| A04 | Alta | Un conteo mostraba la cantidad optimista aunque su escritura fallara. `router.refresh()` conservaba ese estado local y el botón permitía enviarlo a aprobación. | Se conservan los errores por variante, se bloquea el envío y se permite reintentar el mismo valor con Enter. `components/inventory-count-manager.tsx`. |
| A05 | Media | El identificador y los campos del envío persistían cuando un pedido salía de la cola. También se podía cambiar el pedido mientras se esperaba el guardado, mezclando el contexto de la respuesta con otro formulario. | Bloqueo inmediato de la solicitud y de los campos; el editor se vuelve a montar si cambia la lista. Se aplica el mismo reinicio de selección a cobros al salir un pedido pagado. Páginas de envíos/cobros y sus componentes. |
| A06 | Media | Tras despachar, el pedido desaparecía de la cola y se perdía el acceso habitual a marcar entrega, avisar por WhatsApp o abrir su rótulo. | Se recuperan esas acciones en la tabla de paquetes registrados, mostrando también el número del pedido. `components/shipment-followup.tsx` y página de envíos. |
| A07 | Media | Pedidos buscaba únicamente `buyer_name` y TikTok; no encontraba ventas identificadas solo por un cliente vinculado ni por número. Venta rápida tampoco buscaba el código del producto padre. | Búsqueda por cliente vinculado, teléfono y número; búsqueda de producto por nombre o código. Se muestran nombres de clientes vinculados. Página de pedidos, `lib/actions.ts`, `lib/types.ts`. |
| A08 | Media | Dos lecturas rápidas del escáner comprobaban una copia antigua del carrito y podían agregar dos unidades cuando quedaba una. La base rechazaba después la venta por stock insuficiente. | Las lecturas comprueban el carrito actualizado de forma inmediata; se espera a que terminen antes de confirmar. `components/sale-form.tsx`. |
| A09 | Media | Algunos formularios dependían solo del estado visual para frenar doble clic; un fallo de transporte podía dejar el formulario bloqueado o una promesa sin manejar. | Bloqueos mediante referencias y liberación en `finally`; mensajes de resultado y conservación de claves para reintentos. Formularios de envíos, compras, ventas y cobros. |
| A10 | Media | Cada página de envíos recorría todos los pedidos confirmados por lotes para filtrar después. El coste crecía con todo el historial y podía mostrar resultados parciales si fallaba un lote. | Exclusión de despachados/entregados en PostgreSQL antes de contar y paginar. Se selecciona explícitamente `shipments(status)` para respetar los permisos de columnas. Página de envíos. |
| A11 | Alta, dependencia | `npm audit` identificó la versión de Zod instalada dentro del rango del aviso GHSA-mrhx-c7xc-m3w5. Se comprobó la dependencia afectada; no se intentó provocar agotamiento de memoria en el servicio. | Actualización puntual a Zod 4.6.7, con análisis de tipos, compilación y pruebas de validación de servidor. No se actualizaron Next.js, React ni Supabase. |
| A12 | Baja | El filtro de IDs de rótulos admitía cadenas que no eran UUID completos, enviándolas después a una columna UUID. Algunas consultas auxiliares también descartaban sus errores. | UUID completo para rótulos; propagación de errores de búsqueda de productos, expiración de reservas y lista de impresión. |

Los hallazgos anteriores no demuestran que los datos reales hayan sufrido esos fallos. La evidencia corresponde al código de partida y a reproducciones aisladas.

## Reproducción de los casos de mayor impacto

1. **Solicitud incompleta:** en la base temporal anterior a 009, invocar `create_order` con `p_lines=NULL` creaba una cabecera de total cero sin detalle. Con `p_mode=NULL` y una línea válida, se observó `status='reserved'`, `expires_at=NULL`, stock físico 9 y reservado 0, partiendo de 10 unidades. Con 009, las solicitudes se rechazan y el stock permanece igual.
2. **Recepción repetida:** enviar dos veces la misma recepción con su clave a `receive_purchase_once`. Ambos resultados devuelven el mismo ID y el stock aumenta una sola vez. Cambiar la referencia o las líneas con esa clave se rechaza.
3. **DNI no cargado:** simular un error del RPC protegido al abrir un pedido con envío. La versión anterior montaba el editor con DNI vacío; la corregida muestra el error y conserva el registro bloqueando la edición.
4. **Conteo no guardado:** escribir una cantidad y simular un fallo de escritura. La versión anterior habilitaba el envío. La corregida exige guardar o reintentar esa cantidad antes de continuar.
5. **Escáner simultáneo:** resolver dos consultas de lectura cuando solo queda una unidad. La versión anterior acumulaba dos unidades en el carrito; la corregida agrega una y comunica el límite.
6. **Paquete despachado:** volver a cargar la pantalla después de despachar. La cola lo excluye y la tabla de paquetes conserva sus acciones de seguimiento.

## Comprobaciones ejecutadas

| Comprobación | Resultado y alcance |
|---|---|
| `npm run typecheck` | Correcto. |
| `npm run build` | Correcto, compilación completa de producción con configuración ficticia de conexión. Se regeneró la caché local de compilación tras un error de persistencia del entorno. |
| `npm run test:regression` | **28 pruebas aprobadas**: 12 de PostgreSQL —incluida la conservación de datos al migrar—, 5 de interfaz, 6 de páginas/búsqueda y 5 de acciones de servidor. |
| Migraciones 001–009 | Ejecutadas en PostgreSQL embebido mediante PGlite, con los esquemas y usuarios ficticios necesarios para Supabase Auth. Se cargaron las extensiones pgcrypto y pg_trgm. |
| Migración sobre datos existentes | Pedidos, pagos, stock y DNI ficticios permanecieron iguales después de aplicar 009 dos veces. |
| Permisos | RLS en las 21 tablas comprobadas; cero funciones SECURITY DEFINER expuestas a anon en el diagnóstico; operador sin lectura de DNI ni RPC administrativo; usuario inactivo y anónimo rechazados. |
| HTTP local sin sesión | Inicio de sesión devuelve 200; pedidos, envíos y exportación con DNI redirigen a ingreso con 307. Configuración ficticia y servidor iniciado solo para la prueba. |
| Pruebas anteriores al arreglo | Cuatro pruebas SQL fallaban en la versión de partida —incluida la ausencia del RPC de recepción deduplicada— y diez reproducciones de interfaz/páginas fallaban usando sus archivos originales. |
| Controles existentes | Correctos: `check-phase2`, `check-phase3`, `check:fase4a`, `check:fase4b`, `check:deployment` y `git diff --check`. Son controles estáticos o de códigos de barras, no pruebas de producción. |
| Dependencias de producción | Después del arreglo: cero avisos altos o críticos y dos moderados de la misma cadena ExcelJS → uuid, según `npm audit --omit=dev --audit-level=high`. |

Las pruebas de páginas usan el cliente Supabase real y un transporte HTTP simulado para inspeccionar las consultas y sus resultados. No sustituyen la ejecución de esas consultas contra el PostgREST del proyecto real.

## Pendiente de verificar

- **Aplicación en Supabase y despliegue:** se entrega 009 revisable. Esta sesión no dispone de una conexión administrativa a la base real para aplicarla. La nueva versión de compras requiere esa función antes de desplegarse.
- **Concurrencia entre sesiones PostgreSQL independientes:** PGlite serializa las consultas. Se probaron eventos simultáneos de interfaz y reintentos, y se revisaron los bloqueos SQL; no se ejecutó una prueba de transacciones paralelas reales. Se intentó iniciar un PostgreSQL nativo aislado, pero el entorno impidió cambiar de usuario/grupos para arrancarlo.
- **Posible carrera al abrir conteos:** el RPC original usa una comprobación previa de borrador sin una restricción única equivalente. Requiere una reproducción con sesiones independientes antes de cambiarlo.
- **Base y sesión reales:** queda probar el flujo autenticado con las políticas y datos de una base de pruebas equivalente a producción. No se afirma haber validado el pedido real de ningún cliente.
- **Catálogos grandes:** otros módulos conservan límites fijos de lectura —por ejemplo compras y conteos—. Falta probarlos con más registros que el límite efectivo de la API y decidir la paginación correspondiente.
- **ExcelJS → uuid:** el aviso moderado corresponde a APIs v3/v5/v6 con buffer. La llamada encontrada en ExcelJS usa v4. No se demostró un recorrido vulnerable desde la importación del ERP. Se conserva pendiente una actualización compatible, sin aplicar el descenso de versión mayor sugerido automáticamente por npm.
- **Respaldos, restauración, lector e impresora físicos:** no se ejecutaron esas pruebas en el equipo de la tienda.

## Comprobación manual en una base de pruebas

1. Aplica 009 siguiendo [GUIA_MIGRACION_009.md](GUIA_MIGRACION_009.md) y despliega la rama.
2. Crea una prenda ficticia con 10 unidades. Registra una reserva, un adelanto y el saldo; verifica que el stock físico se descuente una vez al confirmar.
3. Busca el pedido por nombre de cliente vinculado y por `#número`. En Envíos debe aparecer mientras esté confirmado y pendiente de despacho.
4. Guarda el destinatario y la agencia. Comprueba el indicador de datos guardados, el número del pedido y el rótulo antes de imprimir.
5. Despacha el paquete. Comprueba que sale de la cola y que en paquetes registrados aparecen “Marcar entregado”, WhatsApp y el rótulo correcto.
6. En un conteo, interrumpe la conexión al guardar una cantidad. Comprueba que no puede enviarse hasta reintentar y guardar correctamente.
7. Reintenta una recepción con los mismos datos y verifica que existe una sola compra y un solo aumento de stock.

## Referencias técnicas consultadas

- [PostgREST: filtrado nulo y anti-joins sobre relaciones](https://docs.postgrest.org/en/v13/references/api/resource_embedding.html#null-filtering-on-embedded-resources).
- [Aviso de Zod GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) y [guía de migración de Zod](https://zod.dev/v4/changelog).
- [Aviso transitivo de uuid GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
