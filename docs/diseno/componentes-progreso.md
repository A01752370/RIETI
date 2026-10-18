# Componentes de progreso (Fase 5)

Tres componentes, iguales en la app Android y en la web, que respetan los [tokens de diseño](tokens.md). La estructura sigue la referencia de un asistente por pasos limpio (pasos conectados por una línea, botón principal grande y redondeado, barra segmentada en móvil); los colores son los del proyecto.

| Componente | Android | Web |
|---|---|---|
| Indicador de pasos | `IndicadorPasos` (`view/ComponentesProgreso.kt`) | `IndicadorPasos` (`src/progreso.tsx`) |
| Barra de progreso segmentada | `BarraProgresoPasos` | `BarraProgreso` |
| Línea de progreso del estatus | `LineaProgresoEstatus` + `LineaEstatus.calcular` (`viewmodel/LineaEstatus.kt`) | `LineaProgreso` + `calcularLinea` |

## 1. Indicador de pasos (asistente de reporte)

**Uso:** solo en flujos de captura con pasos fijos y cortos (hoy, el asistente de 4 pasos: Dónde, A quiénes, Qué ocurre, Revisar y enviar). No se usa para mostrar el estatus de un reporte.

| Estado | Aspecto |
|---|---|
| Completado | Círculo relleno `primario` con palomita blanca; línea hacia el siguiente en `primario`. |
| Actual | Círculo relleno `primario` con el número en blanco y un **halo** (`tinte-primario`); nombre en negritas. |
| Pendiente | Círculo con borde `primario`, número en `primario` y fondo blanco; línea gris `borde`. |

- En pantallas angostas (< 480 dp en Android, < 30 rem en la web) solo se ven los números; el nombre del paso actual va debajo (Android) o en el título del paso (web).
- Los pasos ya visitados se pueden tocar para volver (≥ 48 dp / 44 px); los no alcanzados no.
- Junto al botón principal va la **barra segmentada** (un segmento por paso, lleno en `primario` hasta el actual) con el texto "Paso 2 de 4 · A quiénes".
- **Botón principal:** redondeado (radio completo), ≥ 56 dp / 3.5 rem de alto, con flecha; dice "Continuar", "Guardar y revisar" (si se volvió a editar desde la revisión) o "Enviar reporte" en el último paso.

**Accesibilidad**
- Android: el indicador y la barra se anuncian como "Paso 2 de 4: A quiénes" (`contentDescription` + `progressBarRangeInfo`); el título del paso es encabezado y región viva, así que TalkBack lo anuncia al cambiar.
- Web: `nav` con `aria-label="Pasos del reporte"`, `aria-current="step"` en el paso actual, texto oculto "(completado)"/"(pendiente)"; la barra es `role="progressbar"` con `aria-valuenow`, `aria-valuemax` y `aria-valuetext`. Al cambiar de paso el foco va al título (`h2` con `tabIndex=-1`).
- Errores: resumen arriba (región de alerta) y error junto a cada campo (`aria-invalid` + `aria-describedby` en la web, `isError` + texto de apoyo en Android).
- Movimiento: deslizamiento corto (≤ 220 ms). Con "Quitar animaciones" (Android) o `prefers-reduced-motion` (web) el cambio es instantáneo.

## 2. Línea de progreso del estatus

**Uso:** donde se muestra el avance de un reporte: pantalla de folio, consulta con folio y clave, "Mi panel" (ciudadano) y detalle del personal (con las acciones aparte).

**Reglas**
1. El avance normal es **Recibido → En revisión → En atención → Canalizado → Concluido**.
2. Alcanzado: palomita sobre `primario` y la fecha en que se alcanzó. Actual: círculo con el **color e icono del estatus** y halo, nombre en negritas, "Etapa actual · desde el …". Pendiente: círculo gris solo con borde y "Pendiente".
3. Una etapa que el caso saltó (p. ej. de En revisión a Canalizado) se muestra como **"No fue necesaria en este caso"**, con borde punteado; no como pendiente.
4. **Descartado no es un paso más:** se dibujan solo las etapas alcanzadas y, aparte, un recuadro "Descartado" con su fecha y "El reporte se cerró sin continuar el avance normal".
5. Reincidencia (Concluido → En atención): manda el estatus vigente; Concluido vuelve a verse pendiente.
6. Debajo, la frase del **catálogo único** de significados (`CatalogoEstatus.SIGNIFICADO` en Android, `SIGNIFICADO` en la web, con textos idénticos). **Ningún texto promete tiempos**: no hay un plazo oficial (lo verifica una prueba en cada plataforma).
7. Solo usa estatus y fechas: la persona ciudadana nunca ve comentarios ni notas del personal. En el detalle del personal la línea ignora las notas (solo registro y cambios).

**Accesibilidad:** lista ordenada con nombre ("Avance del reporte"), `aria-current="step"` en la etapa actual (web) y descripción "Etapa 3 de 5: En atención" (Android). El color nunca va solo: cada etapa tiene texto y la actual su icono. Contraste: los colores de estatus llevan texto blanco ≥ 4.5:1 y el texto atenuado usa `texto-secundario` (5.33:1).

## 3. Otros elementos de la Fase 5

- **Insignia "Riesgo percibido"** (detalle y bandeja): fondo rojo claro, texto `#8E1C1C` (≥ 7:1) e icono de advertencia.
- **Bitácora como línea de tiempo** (personal): lo más reciente arriba; icono del estatus para registro y cambios, lápiz gris para notas internas; autor, fecha y hora.
- **Barras de menores por edad** (detalle): una barra por grupo con su número y el total en el título; en la web es SVG con atributos (la CSP no permite estilos en línea).
