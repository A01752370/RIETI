# Guion de prueba de la app y la web

**Para quién:** quien pruebe RIETI antes de una demo o entrega (app Android en el emulador o en un teléfono, y la web en el navegador).
**Estado que describe:** el flujo vigente desde la Fase 5 (asistente de reporte por pasos, línea de progreso del estatus, detalle del personal rediseñado y panel). Capturas de referencia con datos ficticios en [`evidencia/fase-5/`](evidencia/fase-5/).

> Usa **datos ficticios**: nada de nombres, CURP ni domicilios reales. Todo lo que envíes contra producción queda en la base de datos; al terminar, borra los reportes de prueba con el runbook.
>
> Toma captura de cada resultado marcado con 📸. En el build debug las capturas están permitidas (en release la app las bloquea a propósito).

Necesitas: el correo y la contraseña del **usuario de prueba del personal** (los tiene quien administra AWS; no van en el repositorio) y, para la sección 7, un correo propio.

## 1. Comprobar que el backend está arriba

Abre `https://d3hexe1fo0mq6l.cloudfront.net/health` → debe decir `{"estado":"ok"}`. Y `https://d3hexe1fo0mq6l.cloudfront.net/api/v1/avisos-privacidad/vigente` debe traer la versión vigente del aviso (hoy `2026-10-v3`). Si algo no responde, avisa a quien administra AWS antes de seguir.

## 2. Preparar Android Studio

1. Abre el proyecto `RIETI` en la rama `main` (**Git → Pull** para tener lo último).
2. **JDK 21** (el JDK 25 no funciona con Kotlin 1.9): **File → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK →** `jbr-21`.
3. **Sync Project with Gradle Files**, elige el emulador y **Run ▶**.
4. Ubicación de prueba del emulador: **⋯ → Location**, latitud `19.5594`, longitud `-99.2512` → **Set Location**.

## 3. Reportar con el asistente (app)

| # | Pasos | Resultado esperado |
|---|---|---|
| 3.1 | Abre la app. | Inicio con el logo, **Reportar** y **Consultar mi reporte** grandes, el aviso del 911, "Iniciar sesión o crear cuenta (opcional)" y, al final, "Soy personal SIPINNA". |
| 3.2 | **Reportar** → baja hasta el final del aviso → marca **Leí y acepto** → **Continuar**. | El asistente en el **paso 1 de 4 (Dónde)**: arriba el indicador con 4 círculos (el 1 resaltado con halo); abajo "Paso 1 de 4 · Dónde", la barra segmentada y el botón redondo **Continuar →**. 📸 |
| 3.3 | Sin llenar nada, toca **Continuar**. | No avanza. Arriba aparece "Revisa antes de continuar" con la lista de lo que falta, y cada campo marca su error en rojo. 📸 |
| 3.4 | Escribe `atiz` en **Municipio** y elige **Atizapán de Zaragoza**. Toca el mapa o **Estoy en el lugar** (opcional). Llena calle, colonia y código postal `52900`. | Los errores desaparecen al corregir cada campo, sin mover la pantalla. Si tocaste el mapa, la calle, el número y el CP se rellenan solos sin borrar lo que escribiste. |
| 3.5 | **Continuar**. | **Paso 2 (A quiénes)**: el círculo 1 lleva palomita. |
| 3.6 | Toca el botón **Atrás** del sistema. | Regresa al paso 1 con todo lo capturado. Vuelve a **Continuar**. |
| 3.7 | Suma 2 en "De 0 a 5 años" y 1 en "De 12 a 17 años" → **Continuar**. | **Paso 3 (Qué ocurre)**. Sin menores no deja avanzar. |
| 3.8 | Elige **Venta ambulante**, **No sé** y escribe una descripción ficticia → **Continuar**. | **Paso 4 (Revisar y enviar)**: tres tarjetas (Dónde, A quiénes, Qué ocurre) con **Editar** cada una. 📸 |
| 3.9 | **Editar** en "A quiénes", cambia un contador → **Guardar y revisar**. | Vuelve directo a la revisión con el cambio. |
| 3.10 | **Enviar reporte**. | Pantalla de folio y clave (copiar, copiar ambos, compartir) y, abajo, **Avance de tu reporte** con la línea en **Recibido** y la frase "Tu reporte fue recibido y está en fila…". 📸 |
| 3.11 | Inicia otro reporte, llena el paso 1 y toca **Atrás** del sistema. | Pregunta "¿Salir sin enviar?" (lo capturado se borra: no hay borradores). **Seguir reportando** te deja donde estabas. |

## 4. Consultar el avance (app y web)

| # | Pasos | Resultado esperado |
|---|---|---|
| 4.1 | **Consultar mi reporte** con el folio y la clave del paso 3.10 (o **Pegar** si los copiaste). | Estado actual y la **línea de progreso**: Recibido → En revisión → En atención → Canalizado → Concluido; lo alcanzado con palomita y fecha, lo actual resaltado y lo pendiente atenuado; debajo, qué significa la etapa actual. Nunca aparecen notas ni comentarios del personal. 📸 |
| 4.2 | Repite en la web: `/seguimiento`. | La misma línea y el mismo texto. |
| 4.3 | Con una clave inventada. | "El folio o la clave no son correctos". Al quinto fallo el folio se bloquea 15 minutos. |

Un reporte **descartado** se muestra como un final aparte ("El reporte se cerró sin continuar el avance normal") con una explicación sin juicios; una etapa que el caso no necesitó aparece como "No fue necesaria en este caso".

## 5. Personal SIPINNA en la app (control rápido)

| # | Pasos | Resultado esperado |
|---|---|---|
| 5.1 | Inicio → **Soy personal SIPINNA** → correo y contraseña del usuario de prueba → **Ingresar**. | **Inicio del personal**: arriba **Riesgo alto pendientes** (rojo si hay alguno), luego **Pendientes de atender**, **Sin cambios en más de 7 días** y el conteo por estatus. 📸 |
| 5.2 | Toca **Riesgo alto pendientes**. | Bandeja filtrada ("Riesgo alto pendientes ✕"): solo casos en Recibido o En revisión con riesgo percibido "Sí", con la insignia **Riesgo percibido**. |
| 5.3 | Abre tu reporte del paso 3. | **Detalle**: folio con **Copiar**, estatus, municipio, "Alta: … · hace …" y "En “Recibido” desde hace …"; justo debajo, los botones de los cambios permitidos (**En revisión**, **Descartado**) y **Agregar nota**, sin desplazarte. 📸 |
| 5.4 | Toca **Descartado**. | Diálogo con **motivo obligatorio**: "Cambiar" no se activa sin motivo. **Cancelar**. |
| 5.5 | **En revisión** → comentario `Se asigna a enlace municipal` → **Cambiar**. | "Estatus cambiado a “En revisión”." sin recargar; ahora los botones son En atención, Canalizado y Descartado; la línea de avance y la bitácora se actualizan. |
| 5.6 | Baja por la pantalla. | Tarjetas: Resumen, Ubicación (dirección, mini mapa con el punto y **Abrir en el mapa del teléfono**), Menores (barras por edad con el total), Actividad y riesgo, Descripción (con "Ver todo" si es larga) y la **Bitácora** como línea de tiempo: lo más reciente arriba, distinguiendo cambio de estatus, nota interna y registro. 📸 |
| 5.7 | Desliza hacia abajo desde arriba. | Se actualiza el detalle. |

## 6. Personal en la web (versión técnica)

| # | Pasos | Resultado esperado |
|---|---|---|
| 6.1 | `/personal` → inicia sesión. | Bandeja con filtros de estatus, riesgo percibido, actividad, municipio, fechas, sin atender y "Solo pendientes". Los filtros quedan en la dirección del navegador (el enlace se puede compartir). |
| 6.2 | Abre un reporte. | Dos columnas: datos a la izquierda (resumen, ubicación con mini mapa, menores, actividad y riesgo, descripción) y avance, acciones y bitácora a la derecha. Arriba **← Anterior · N de M · Siguiente →** dentro de la bandeja filtrada. 📸 |
| 6.3 | Teclea `j` y `k`. | Siguiente y anterior reporte; `n` lleva a la nota y `b` regresa a la bandeja (no actúan mientras escribes). |
| 6.4 | **Imprimir ficha**. | Vista de impresión solo con los datos del reporte y la bitácora (sin correos del personal ni botones). |
| 6.5 | **Panel**. | Primero **Requiere atención** (riesgo alto, pendientes, sin cambios en N días, nuevos), luego **Tiempos reales** (del alta a la primera revisión y a la conclusión; con pocos casos dice "Datos insuficientes") y después estatus, municipio, grupo de edad, actividad, mapa de calor y serie mensual. Los filtros se aplican a todo, incluido **Exportar CSV de lo filtrado**. 📸 |

## 7. Cuenta opcional de ciudadano (app)

Usa un correo al que tengas acceso: el código llega por correo (remitente `no-reply@verificationemail.com`; revisa spam).

| # | Pasos | Resultado esperado |
|---|---|---|
| 7.1 | Inicio → **Iniciar sesión o crear cuenta (opcional)** → **Crear cuenta** con una contraseña de 12+ caracteres con mayúscula, minúscula y número. | Mensaje "Si el correo es válido, te enviamos un código…" y el paso **Activa tu cuenta**. |
| 7.2 | Código del correo → **Activar cuenta** → contraseña → **Iniciar sesión**. | **Mi panel**. En el inicio el botón cambia a **Mi panel: ver mis reportes**. |
| 7.3 | Reporta con el asistente hasta **Revisar y enviar**. | Al final aparece **Vincular este reporte a mi cuenta**, **apagado**. Enviado así, el reporte es anónimo y no aparece en Mi panel. |
| 7.4 | Otro reporte con el interruptor **encendido**. | Aparece en **Mi panel** con su línea de progreso. 📸 |
| 7.5 | **Cuenta** → cambia la contraseña; luego **Eliminar mi cuenta** → **Eliminar**. | Vuelve al inicio sin sesión; el reporte vinculado sigue en la bandeja del personal. |

## 8. Accesibilidad rápida

- **Letra grande** (Ajustes → Pantalla → Tamaño de fuente al máximo): el asistente y el detalle se leen sin cortes y las acciones del detalle siguen visibles arriba. 📸
- **TalkBack**: el indicador se anuncia como "Paso 2 de 4: A quiénes"; al cambiar de paso se anuncia el nuevo título; cada paso de la línea de progreso se lee con su estado y fecha.
- **Quitar animaciones** (Accesibilidad): el cambio de paso es instantáneo.
- **Web solo con teclado**: Tab recorre el asistente; al cambiar de paso el foco va al título del paso; el indicador tiene `aria-current="step"` y la barra `role="progressbar"`.

## Si algo falla

| Lo que ves | Causa probable | Qué hacer |
|---|---|---|
| El build falla con `25.0.3` | Gradle está usando JDK 25 | Paso 2.2 |
| "No hay conexión con el servidor…" | El emulador no tiene internet | Abre Chrome en el emulador; reinicia el emulador (Cold Boot) |
| La web responde **403 "Request blocked"** | Límite por IP del WAF (300 peticiones cada 5 minutos, compartido por toda la red) | Espera 5 minutos; ver la nota del WAF en `arquitectura/aws.md` |
| "Demasiados intentos…" al consultar | 5 claves incorrectas para el mismo folio | Espera 15 minutos |
| "Tu cuenta requiere un paso adicional…" / "no tiene un rol de personal" | Usuario del personal mal creado | Runbook, alta de personal |
| Te regresa al login a mitad de la prueba | El token del personal dura 60 minutos (y en la web se pierde al recargar) | Vuelve a iniciar sesión |
