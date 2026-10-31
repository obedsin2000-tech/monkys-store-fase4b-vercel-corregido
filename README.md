# MONKY'S STORE ERP — FASE 4B
## Instalación para Windows 11 — guía para quien no programa

**Qué incorpora esta actualización:** etiquetas Code 128 por prenda, impresión masiva, venta rápida y recepción con escáner USB, conteos físicos con escaneo, revisión por administrador y ajustes aprobados en Kardex. Mantiene las Fases 1, 2, 3 y 4A.

**Qué NO incluye:** venta automática al escanear, impresión sin impresora, códigos GS1 oficiales, API de WhatsApp o Shalom, integración con cámaras móviles, ni restauración automática de Supabase.

### Antes de actualizar

- Confirma que la **Fase 4A funciona** en tu computadora y que la migración `004_fase4a.sql` terminó sin errores.
- **Haz y verifica un respaldo de Supabase** usando el script corregido de Fase 4A. Si el respaldo falla, detente. Un archivo `.backup` legible aún debe probarse restaurándolo en una base separada.
- Guarda una copia de tu carpeta `monkys-store-fase4a` y no la elimines.
- No compartas `.env.local`, claves o archivos `.backup` con nadie.
- Utiliza datos de prueba para empezar; no realices ajustes de stock real hasta superar las pruebas de aceptación.

### 1. Descargar y descomprimir

1. Descarga el ZIP de Fase 4B.
2. En Descargas, haz clic derecho > **Extraer todo**.
3. Abre la carpeta `monkys-store-fase4b` y comprueba que contenga `01_INSTALAR_FASE4B.bat` y la carpeta `supabase`.
4. Conserva la carpeta Fase 4A en otro lugar como respaldo del código.

### 2. Guardar una copia de seguridad de tus datos

1. Abre Fase 4A y ejecuta `04_CREAR_RESPALDO.bat` **en su versión corregida**.
2. Rellena host, puerto, usuario, base de datos y contraseña cuando se soliciten (es la contraseña de PostgreSQL, no la de tu cuenta de Supabase).
3. Debe mostrar `RESPALDO CREADO Y ARCHIVO LEGIBLE`.
4. Comprueba el archivo `.backup` con `05_VERIFICAR_RESPALDO.bat`.
5. Guarda una segunda copia cifrada fuera de la laptop; jamás en una carpeta pública.
6. **Si no obtienes una copia válida, NO ejecutes 005.**

### 3. Actualizar Supabase (una sola vez)

1. Entra a https://supabase.com/dashboard y abre **tu proyecto habitual**.
2. Abre **SQL Editor > New query**.
3. En **Run as**, selecciona **postgres** (no `authenticated`).
4. En el proyecto nuevo, abre `supabase\migrations\005_fase4b.sql` con Bloc de notas.
5. Presiona `Ctrl + A` y `Ctrl + C` para copiar **todo**.
6. En Supabase pega el contenido y presiona el botón verde **Run**.
7. El resultado esperado es **Success. No rows returned**.
8. Si aparece error rojo, **no borres tablas ni repitas 001, 002, 003 o 004**. Copia el error exacto.

Esta migración añade el campo `barcode` a las variantes existentes, mantiene el SKU original, crea una numeración permanente y añade dos tablas de conteo (`inventory_counts`, `inventory_count_lines`). **No cambia las cantidades de stock ni el precio.**

### 4. Comprobar que las etiquetas se crearon

En Supabase > SQL Editor (Run as postgres), ejecuta esta consulta **solo de lectura**:

```sql
SELECT
  count(*) AS variantes,
  count(barcode) AS con_codigo,
  count(DISTINCT barcode) AS codigos_unicos
FROM public.variants;
```

Las tres cifras deben coincidir. Si no coinciden, detente.

Para comprobar tablas nuevas: **Table Editor** > `public` > `inventory_counts` e `inventory_count_lines`.

### 5. Copiar la conexión existente

1. Abre la carpeta Fase 4A.
2. En Windows activa **Ver > Mostrar > Elementos ocultos**.
3. Copia `.env.local` a la nueva carpeta `monkys-store-fase4b`.
4. No lo edites si ya funcionaba. No compartas su contenido.

### 6. Instalar las dependencias

1. Haz doble clic en `00_COMPROBAR_FASE4B.bat` y revisa si Node.js aparece correctamente.
2. Haz doble clic en `01_INSTALAR_FASE4B.bat`.
3. Mantén la ventana abierta hasta ver **Dependencias instaladas**.
4. Si hay error, copia únicamente el mensaje, sin datos secretos.

### 7. Abrir la aplicación

1. Si la Fase 4A sigue abierta en el puerto 3000, en su ventana negra presiona `Ctrl + C` para detenerla.
2. En la carpeta Fase 4B, ejecuta `02_INICIAR_MONKYS.bat`.
3. Entra a **http://localhost:3000/ingresar**.
4. Inicia sesión con **tu cuenta de siempre**. No necesitas crear otra cuenta ni proyecto.

### 8. Imprimir etiquetas

1. En el menú, abre **Etiquetas de prendas** (`/etiquetas`).
2. Busca una prenda por código, talla o color.
3. Escribe cuántas etiquetas deseas imprimir; puedes seleccionar varias variantes.
4. Elige **50 × 30 mm**, recomendable para iniciar.
5. Haz clic en **Imprimir etiquetas**.
6. En el cuadro de impresión, selecciona tu impresora, **escala 100%**, desactiva encabezados y pies, y comprueba el tamaño de papel.
7. Si usas hojas adhesivas normales, prueba primero con papel común para ajustar el alineado. Si tu impresora es térmica, configura el mismo tamaño en el controlador de Windows.

**Nota:** el sistema utiliza códigos Code 128 internos. No son códigos GS1/EAN comerciales.

### 9. Utilizar lector USB en ventas

1. Conecta tu lector USB al equipo. En Windows normalmente funciona como teclado.
2. Configúralo para enviar la tecla **Enter** al terminar de leer; revisa el manual del lector.
3. Abre **Venta rápida** (`/ventas`).
4. Haz clic en el campo **Escáner de código de barras**.
5. Escanea una etiqueta impresa. Debe añadirse una unidad al carrito.
6. Puedes escanear la misma prenda otra vez; se suma 1 si hay stock disponible.
7. **Escanear NO cobra ni confirma ventas.** Solo agrega al carrito; confirma manualmente después de verificar el pago.

### 10. Escanear en compras

En **Compras**, escanea una etiqueta para seleccionar su variante. Revisa cantidad y costo antes de hacer clic en **Confirmar recepción**. Nunca se confirma automáticamente.

### 11. Realizar un conteo físico de prueba

1. Ve a **Conteo con escáner** (`/inventario/conteos`).
2. Escribe una descripción como "Conteo de prueba" y selecciona **Iniciar conteo nuevo**.
3. Abre su sesión; enfoca el campo de escáner.
4. Escanea 3 veces la misma etiqueta: el sistema registrará cantidad contada 3.
5. Si necesitas corregirla, escribe la cantidad exacta en la tabla y pulsa Enter o haz clic fuera del campo.
6. Espera a que desaparezca el mensaje de guardado.
7. Pulsa **Enviar a aprobación**. El stock NO se modifica todavía.
8. Un administrador podrá aprobar los ajustes si no hubo cambios de stock/reservas desde que se inició el conteo.
9. **Para una prueba sin riesgos**, cancela ese conteo; no apruebes diferencias con existencias reales.

### 12. Verificar antes de usar en producción

- Ejecuta `03_REVISAR_CODIGOS_FASE4B.bat`. Debe terminar con OK.
- Realiza las pruebas de `tests\PRUEBAS_FASE4B.md` usando datos ficticios o una base de pruebas.
- Prueba que tu lector realmente lee las etiquetas que imprime tu impresora.
- Prueba la recuperación de la base de datos en una base aislada. Un respaldo leído no garantiza recuperación.

### Problemas comunes

| Error | Solución |
|---|---|
| `permission denied for schema public` | Cambia SQL Editor > Run as a `postgres`. |
| `phase4a_security_report does not exist` | La Fase 4A no está instalada; no ejecutes 005 todavía. |
| `column variants.barcode does not exist` | Falta ejecutar 005; comprueba que salió Success. |
| `already exists` al ejecutar 005 | No repitas la migración; revisa Table Editor y la consulta de comprobación. |
| `supabase URL is required` | Copia el `.env.local` de la Fase 4A. |
| El lector escribe código y no pasa nada | Haz clic en el campo de escáner y comprueba que envíe Enter. |
| Las etiquetas no se escanean | Usa 50×30 mm, impresión nítida, 100% escala y verifica los márgenes. |
| `El stock cambió desde que empezó el conteo` | Cancela el conteo y crea otro con el stock actualizado. |
| `Ya tienes un conteo en borrador` | Abre el borrador, finalízalo o cancélalo antes de crear otro. |

### Estado real de la entrega

El código ha pasado una revisión de sintaxis TypeScript y pruebas del cálculo de códigos Code 128 en este entorno. **Aún falta compilarlo con todas sus dependencias y ejecutar la migración y las funciones sobre una base Supabase real**, así como probar impresión y lectores físicos. Esos pasos deben validarse en tu equipo antes de usarlo con mercancía real.
