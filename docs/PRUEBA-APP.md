# Guion de prueba de la app y la web

**Para quién:** quien pruebe RIETI antes de una demo o entrega (app Android en el emulador o en un teléfono, y la web en el navegador).
**Estado que describe:** el flujo vigente al cierre de la Fase 9: asistente de reporte en 5 pasos con fotos opcionales, estatus del catálogo del socio, expediente interno, acceso por municipio, alertas, mapa territorial y cuenta opcional. Capturas de referencia con datos ficticios en [`evidencia/`](evidencia/) (carpetas `fase-5` a `fase-9`).

> **Datos ficticios siempre:** nada de nombres, CURP, domicilios reales ni fotos de personas. Empieza **toda descripción** con `[PRUEBA]` (por ejemplo, `[PRUEBA] Dos menores vendiendo dulces en el crucero`). Así el script de limpieza los encuentra (runbook, "Limpieza de datos de prueba"). Para las fotos usa una imagen de un lugar sin personas.
>
> Antes de crear reportes, revisa en la bandeja si ya existen reportes `[PRUEBA]` que te sirvan; no dupliques datos.
>
> Toma captura de cada resultado marcado con 📸. En el build debug las capturas están permitidas (en release la app las bloquea a propósito).

**Necesitas:**
- Las cuentas de prueba del personal (las tiene quien administra AWS; no van en el repositorio). Lo ideal son tres perfiles: **Enlace municipal** asignado a Atizapán, **Coordinador regional** y **Administrador**. Con una sola cuenta de enlace puedes hacer casi todo menos las secciones 8.3 y 9.
- Para la sección 10, un correo propio.

## 1. Comprobar que el backend está arriba

Abre `https://d3hexe1fo0mq6l.cloudfront.net/health`: debe decir `{"estado":"ok"}`. Después abre `https://d3hexe1fo0mq6l.cloudfront.net/api/v1/avisos-privacidad/vigente`: debe traer la versión vigente del aviso (hoy `2026-10-v3`).

## 2. Preparar Android Studio

1. Abre el proyecto `RIETI` en la rama `main` (**Git → Pull**).
2. **JDK 21** (el JDK 25 no funciona con Kotlin 1.9): **File → Settings → Build Tools → Gradle → Gradle JDK →** `jbr-21`.
3. **Sync Project with Gradle Files**, elige el emulador y **Run ▶**.
4. Ubicación del emulador: **⋯ → Location**, latitud `19.5594`, longitud `-99.2512` → **Set Location**.
5. Para la prueba de fotos, arrastra al emulador una imagen de un lugar (sin personas); queda en la galería.

## 3. Reportar con el asistente (app)

| # | Pasos | Resultado esperado |
|---|---|---|
| 3.1 | Abre la app. | Inicio con el logo, **Reportar** y **Consultar mi reporte** grandes, el aviso del 911, "Iniciar sesión o crear cuenta (opcional)" y, al final, "Soy personal SIPINNA". |
| 3.2 | **Reportar** → baja hasta el final del aviso → **Leí y acepto** → **Continuar**. | **Paso 1 de 5: ¿Cómo quieres realizar tu reporte?** **Anónimo** viene elegido; **Con seguimiento** usa la cuenta opcional (sección 10). 📸 |
| 3.3 | **Continuar** sin cambiar nada. | **Paso 2: Dónde**. Si tocas **Continuar** vacío, aparece "Revisa antes de continuar" y cada campo marca su error. |
| 3.4 | Municipio `atiz` → **Atizapán de Zaragoza**; toca el mapa o **Estoy en el lugar**; calle, colonia y CP `52900` → **Continuar**. | **Paso 3: A quiénes**. La dirección se autocompleta sin borrar lo que escribiste. |
| 3.5 | **¿Está en peligro inmediato?** → **Sí**. | Aviso rojo "Llama al 911 ahora…" con el botón **Llamar al 911** (no lo toques en la prueba). 📸 Cambia a **No**. |
| 3.6 | **¿Cuántas?** → `2`; edades **0–5** y **12–14**; reparte 1 y 1 → **Continuar**. | **Paso 4: Qué ocurre**. Si la suma no cuadra con la cantidad, no deja avanzar. |
| 3.7 | Actividad **Venta ambulante**, riesgo **No sé**, descripción que empiece con `[PRUEBA]`. | Debajo aparece **Fotografía (opcional)** con la advertencia del socio ("Evita tomar fotografías que pongan en riesgo…"). Los botones de fotos **no aparecen** hasta marcar **Leí la advertencia y quiero adjuntar fotos**. 📸 |
| 3.8 | Marca la casilla → **Elegir de la galería** → elige la imagen de prueba → **Done**. | Se abre el **selector de fotos del sistema** (la app no pide permiso de almacenamiento). Queda "Foto 1 · N KB" con **Quitar**. **Tomar foto** abre la cámara del sistema (sin permiso de cámara). Máximo 3 fotos. 📸 |
| 3.9 | **Continuar**. | **Paso 5: Revisar y enviar**: bloques Cómo, Dónde, A quiénes y Qué ocurre con **Editar**; "Fotos: 1 (se adjuntan al enviar)". 📸 |
| 3.10 | **Enviar reporte**. | Folio con clave municipal (`RIETI-ATZ-2026-NNNNNN`) y clave de consulta, **"Se adjuntó 1 foto al reporte."** y la línea de avance en **Registrado**. Anota folio y clave. 📸 |
| 3.11 | Empieza otro reporte, llena algo y toca **Atrás** del sistema en el primer paso. | Pregunta "¿Salir sin enviar?" (no hay borradores). |

## 4. Reportar desde la web

| # | Pasos | Resultado esperado |
|---|---|---|
| 4.1 | `/reportar` → acepta el aviso. | El mismo asistente de 5 pasos. En "Cómo" solo está disponible **Anónimo** (el seguimiento con cuenta es de la app). |
| 4.2 | Recorre los pasos con datos ficticios (`[PRUEBA]`), marca la advertencia y elige un archivo de imagen. | La foto se lista con **Quitar**; solo acepta JPG, PNG o WebP y hasta 3. |
| 4.3 | **Enviar reporte**. | Folio, clave y "Se adjuntó 1 foto al reporte.". Si fallara la foto, dice que **el reporte sí quedó registrado** y ofrece reintentar. 📸 |

## 5. Consultar el avance (app y web)

| # | Pasos | Resultado esperado |
|---|---|---|
| 5.1 | **Consultar mi reporte** con folio y clave (o **Pegar**). | Estatus con su **etiqueta del socio**: Registrado → En revisión → En seguimiento → Canalizado → Concluido. Lo alcanzado con palomita y fecha, lo actual resaltado y su significado. Nunca aparecen notas, expediente ni fotos. 📸 |
| 5.2 | Repite en la web: `/seguimiento`. | Lo mismo. Acepta folios nuevos (`RIETI-ATZ-…`) y heredados (`RIETI-2026-…`). |
| 5.3 | Con una clave inventada. | "El folio o la clave no son correctos". Al quinto fallo el folio se bloquea 15 minutos. |

**Cancelado**, **Archivado** y **Reincidente** se muestran como finales aparte de la línea normal, con una explicación sin juicios.

## 6. Personal en la app (control rápido)

| # | Pasos | Resultado esperado |
|---|---|---|
| 6.1 | **Soy personal SIPINNA** → cuenta de enlace → **Ingresar**. | **Inicio del personal**: **Prioridad alta pendientes**, **Seguimientos vencidos**, **Alertas de punto recurrente** (si hay), pendientes, sin cambios en 7 días, conteo por estatus y **Registrar detección en recorrido**. Solo cuenta reportes de **sus municipios**. 📸 |
| 6.2 | Toca **Prioridad alta pendientes** y luego **Seguimientos vencidos**. | Bandeja filtrada, ordenada por prioridad, con insignias **Prioridad alta**, **Seguimiento vencido**, **Posible duplicado** e **Institucional**. |
| 6.3 | Abre tu reporte del paso 3. | Encabezado con folio y estatus; botones de los cambios permitidos, **Agregar nota** y **Registrar acción**. Tarjeta **Expediente** con responsable, verificación, próximo seguimiento y dependencia, y los botones **Asignarme** y **Cambiar verificación**. 📸 |
| 6.4 | **Asignarme**. Después **Cambiar verificación → Verificado → Guardar**. | Eres responsable y la verificación cambia; la bitácora muestra "Cambio en el expediente". |
| 6.5 | **Registrar acción → Llamada →** texto `[PRUEBA] llamada ficticia` → **Registrar**. | "Acción registrada."; en la bitácora, "Acción realizada". |
| 6.6 | Baja hasta **Fotos · 1** → **Ver fotos**. | Se muestra la foto (se descarga con un enlace que caduca en 1 minuto y queda en la bitácora de accesos). 📸 |
| 6.7 | **En revisión** → **En seguimiento** → **Concluido**. | Al concluir, **Resultado del caso (obligatorio)**: "Cambiar" no se activa sin él. Con resultado, concluye. |
| 6.8 | Inicio → **Registrar detección en recorrido** → recorre el asistente (`[PRUEBA]`) → **Enviar**. | El aviso "Registro institucional (detección en recorrido)" en el primer paso, sin fotos ni cuenta; al guardar abre el detalle del nuevo reporte con origen institucional. Fuera de sus municipios el servidor lo rechaza. |

## 7. Personal en la web (versión técnica)

| # | Pasos | Resultado esperado |
|---|---|---|
| 7.1 | `/personal` → inicia sesión. | Bandeja con filtros (estatus, prioridad, riesgo, actividad, municipio, fechas, sin atender, verificación, origen, pendientes y vencidos); los filtros quedan en la dirección. Menú: Bandeja, Panel, Alertas, **Registrar**, Mi perfil (y **Administración** si eres administrador). |
| 7.2 | Abre un reporte. | Dos columnas; a la derecha, seguimiento con **Nota interna / Acción realizada**, **Expediente** (**Editar**: responsable, verificación, dependencia, fecha de seguimiento, modalidad, NNA y niñas/niños), **Posible duplicidad** (**Buscar posibles duplicados**) y la bitácora. 📸 |
| 7.3 | **Editar** el expediente → dependencia "DIF municipal" y NNA canalizados `1` → **Guardar expediente**. | La bitácora agrega "Dependencia: — → DIF municipal · NNA canalizados: — → 1" con tu correo. |
| 7.4 | **Buscar posibles duplicados** en un reporte cercano a otro. | Lista de reportes del mismo municipio a menos de 150 m (configurable) con la distancia y "Este reporte es duplicado de …". Marcarlo no borra nada y se puede quitar. |
| 7.5 | **Ver fotos** en un reporte con foto. | Miniaturas cargadas con un enlace de 1 minuto; consultarlas queda en la bitácora de accesos. |
| 7.6 | **Panel**. | Requiere atención, **embudo** (recibidos → verificados → casos → NNA canalizados, sin duplicados), seguimientos vencidos, alertas, tiempos reales, **hallazgos automáticos**, **mapa territorial** y gráficas (incluidas horario de registro, niñas/niños con umbral y dependencia). 📸 |
| 7.7 | En el panel prueba los filtros: rango de edad, riesgo, prioridad, horario, dependencia, verificación, origen y **Solo puntos recurrentes**. | Todo el panel, el mapa y la exportación cambian juntos. |
| 7.8 | Mapa territorial: **Región** → toca Atizapán → **Colonias** → **Puntos** → toca un punto. | Región: municipios coloreados por conteo (los de pocos reportes en gris, "menos de 3"). Colonias: círculos por colonia. Puntos: uno por reporte (sin texto); tocarlo abre el detalle. Debajo, la tabla alternativa. 📸 |
| 7.9 | **Registrar** (menú). | El asistente en modo institucional, sin aviso ni fotos; al guardar muestra el folio y **Abrir el reporte**. |
| 7.10 | **Alertas**. | Alertas de punto recurrente de tus municipios (3 reportes en 150 m y 30 días por omisión) con sus folios. **Marcar como atendida** pide qué se hizo. |
| 7.11 | **Mi perfil**. | Perfil, municipios que atiendes y lo que puedes hacer. |

## 8. Acceso por municipio

| # | Pasos | Resultado esperado |
|---|---|---|
| 8.1 | Con el enlace de Atizapán, pon en la dirección `/personal/reportes/<id>` de un reporte de otro municipio (si no conoces uno, usa un número que no exista). | "Reporte no encontrado": la misma respuesta que un reporte inexistente. |
| 8.2 | En el panel, filtra por otro municipio. | Cero reportes; en el mapa de región solo aparece Atizapán. |
| 8.3 | Con la cuenta de **Coordinador regional**. | Ve todos los municipios. En el panel aparece **Base regional anonimizada (CSV)**: celdas de ≈ 110 m por municipio y trimestre, solo conteos, sin texto, direcciones ni fotos. No ve **Administración**. |

## 9. Administración (cuenta de Administrador)

| # | Pasos | Resultado esperado |
|---|---|---|
| 9.1 | **Administración → Personal y municipios → Asignar municipios** en el enlace de prueba. | Se agregan o quitan municipios. Un enlace sin municipios no ve ningún reporte. |
| 9.2 | **Parámetros**. | Radios y ventanas de duplicados y alertas, mínimo de reportes y conservación de accesos, con límites (por ejemplo, el mínimo de alerta no baja de 2). |
| 9.3 | **Dependencias**: agrega una y desactívala. | Desaparece del selector del expediente sin afectar los expedientes que la usan. |
| 9.4 | **Bitácora de accesos** → filtra por el folio de tu reporte. | Quién lo consultó, quién vio sus fotos y quién exportó, con fecha. No se puede modificar. |

## 10. Cuenta opcional de ciudadano (app)

El código llega por correo (remitente `no-reply@verificationemail.com`; revisa spam).

| # | Pasos | Resultado esperado |
|---|---|---|
| 10.1 | **Iniciar sesión o crear cuenta (opcional)** → **Crear cuenta** (contraseña de 12+ caracteres con mayúscula, minúscula y número). | "Si el correo es válido, te enviamos un código…" y **Activa tu cuenta**. |
| 10.2 | Código → **Activar cuenta** → **Iniciar sesión**. | **Mi panel**. |
| 10.3 | Reporta eligiendo **Con seguimiento** en el paso 1. | En la revisión aparece **Vincular este reporte a mi cuenta** (apagado por omisión); encendido, el reporte aparece en **Mi panel** con su línea de avance. El personal nunca ve la cuenta ni el correo. 📸 |
| 10.4 | **Cuenta** → **Eliminar mi cuenta**. | Vuelve al inicio sin sesión; el reporte sigue en la bandeja del personal, sin vínculo. |

## 11. Accesibilidad rápida

- **Letra grande** al máximo: el asistente, el detalle y el expediente se leen sin cortes. 📸
- **TalkBack**: el indicador se anuncia como "Paso 2 de 5: Dónde"; las fotos del personal se anuncian como "Foto 1 del reporte …".
- **Web solo con teclado**: Tab recorre el asistente, el botón de elegir fotos y el panel; el mapa tiene su tabla alternativa.

## 12. Al terminar

Borra los reportes de prueba con el script de limpieza (runbook, "Limpieza de datos de prueba"). Primero corre la **simulación** (`--dry-run`), revisa la lista y luego confirma.

## Si algo falla

| Lo que ves | Causa probable | Qué hacer |
|---|---|---|
| El build falla con `25.0.3` | Gradle está usando JDK 25 | Paso 2.2 |
| "No hay conexión con el servidor…" | El emulador no tiene internet | Reinicia el emulador (Cold Boot) |
| La web responde **403 "Request blocked"** | Límite por IP del WAF (2,000 peticiones cada 5 minutos en general y 600 al API, compartido por toda la red) | Espera 5 minutos |
| "Demasiados intentos…" al consultar o al adjuntar fotos | 5 claves incorrectas para el mismo folio | Espera 15 minutos |
| "Las fotos solo se pueden agregar en las 24 horas siguientes" | El reporte tiene más de un día | Es lo esperado |
| "Reporte no encontrado" con la cuenta de enlace | El reporte es de un municipio que no tienes asignado | Pide la asignación (sección 9.1) |
| "No tienes permiso para esta acción" en Administración o en la base regional | Tu perfil no la incluye | Es lo esperado |
| Te regresa al login a mitad de la prueba | El token del personal dura 60 minutos (y en la web se pierde al recargar) | Vuelve a iniciar sesión |
