# Guion de prueba de la app en el emulador

**Para quién:** Bowser (o quien pruebe la app Android).
**Antes de empezar:** los pasos 2, 3 y 4 del [RUNBOOK-AWS](RUNBOOK-AWS.md) ya se hicieron (backend nuevo desplegado, reporte de prueba borrado y usuario de personal creado). Necesitas el correo y la contraseña de ese usuario.

> Usa **datos ficticios**: nada de nombres, CURP ni domicilios reales. Todo lo que envíes queda en la base de datos de producción.
>
> Toma captura de cada resultado marcado con 📸: sirven como evidencia para la documentación. En el build debug las capturas están permitidas (en release la app las bloquea a propósito).

## 1. Comprobar que el backend nuevo está arriba

Abre en el navegador: `https://d3hexe1fo0mq6l.cloudfront.net/api/v1/catalogos`

- **Esperado:** un JSON que termina en `"estatus":["Recibido","En revisión","En atención","Canalizado","Concluido","Descartado"]`.
- Si ves `Cannot GET /api/v1/catalogos`, el backend nuevo aún no se despliega: para aquí y avisa a quien administra AWS.

## 2. Preparar Android Studio

1. Abre el proyecto `RIETI`.
2. Cambia a la rama con el código nuevo: abajo a la derecha haz clic en el nombre de la rama → **main** (si el PR ya se fusionó) → **Update** (o `integracion-final` si aún no se fusiona).
3. **Elige el JDK 21** (el JDK 25 que trae Android Studio no funciona con Kotlin 1.9 y el build falla con un error que solo dice `25.0.3`):
   **File → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK →** `jbr-21` (`C:\Users\Bowser\.jdks\jbr-21.0.11`) → **OK**.
4. Clic en el elefante **Sync Project with Gradle Files**.
5. Elige tu emulador arriba y presiona **Run ▶**.
6. Pon una ubicación de prueba en el emulador: en la barra lateral del emulador, **⋯ (Extended controls) → Location**, escribe latitud `19.5594` y longitud `-99.2512` → **Set Location**.

## 3. Pruebas del ciudadano

| # | Pasos | Resultado esperado |
|---|---|---|
| 3.1 | Abre la app. | Pantalla **RIETI** con "Reportar una situación", "Consultar mi reporte", "Soy personal SIPINNA" y el recuadro del 911. No hay "Crear cuenta". 📸 |
| 3.2 | Toca **Reportar una situación**. | Aviso de privacidad (versión `2026-10-v1`). El botón **Continuar** está desactivado. |
| 3.3 | Marca **Leí y acepto el aviso de privacidad** → **Continuar**. | Formulario de reporte. |
| 3.4 | Sin llenar nada, baja y toca **Enviar reporte**. | Recuadro rojo con la lista de lo que falta (lugar, cantidad, edad, actividad, riesgo, descripción). |
| 3.5 | Escribe un lugar ficticio, p. ej. `Crucero de Av. Ejemplo y Calle 5`. Toca **Estoy en el lugar: usar mi ubicación actual** y acepta el permiso. | Aparece la tarjeta "Ubicación del lugar de los hechos" con `19.55940, -99.25120`. |
| 3.6 | Elige **2 a 3**, **6-11**, **Venta ambulante**, **No sé** y escribe una descripción ficticia. Toca **Enviar reporte**. | Pantalla **Reporte enviado** con un folio `RIETI-2026-000…` y una clave `XXXX-XXXX-XXXX`. 📸 |
| 3.7 | **Anota el folio y la clave** (o toca **Copiar folio y clave**). Toca **Ya los guardé, volver al inicio**. | Regresa al inicio. Con el botón Atrás ya no se puede volver al formulario. |
| 3.8 | Toca **Consultar mi reporte**. Escribe el folio y una clave **inventada**. **Consultar**. | "El folio o la clave no son correctos". ⚠️ No lo intentes más de 4 veces: al quinto fallo el folio se bloquea 15 minutos. |
| 3.9 | Escribe la clave correcta (puedes usar minúsculas). **Consultar**. | Estado actual **Recibido**, fecha de registro e historial con un solo renglón. No aparece la descripción ni el lugar. 📸 |

## 4. Pruebas del personal SIPINNA

| # | Pasos | Resultado esperado |
|---|---|---|
| 4.1 | Regresa al inicio → **Soy personal SIPINNA**. Escribe tu correo y una contraseña **incorrecta** → **Ingresar**. | "Correo o contraseña incorrectos". La contraseña se ve con puntos. |
| 4.2 | Escribe la contraseña correcta → **Ingresar**. | **Bandeja de reportes** con tu reporte del paso 3 hasta arriba (estatus **Recibido**). No aparece `RIETI-2026-000001`. 📸 |
| 4.3 | Toca el filtro **En revisión**. | "No hay reportes con este filtro." Toca **Todos** para volver. |
| 4.4 | Toca tu reporte. | **Detalle del reporte** con todos los datos, coordenadas, y en "Cambiar estatus a:" solo **En revisión** y **Descartado**. Bitácora con "Recibido · Registro automático". 📸 |
| 4.5 | Toca **Descartado** y luego **Cambiar a "Descartado"** sin escribir motivo. | "Para descartar escribe el motivo". Toca **Descartado** otra vez para quitar la selección. |
| 4.6 | Toca **En revisión**, escribe el comentario `Se asigna a enlace municipal` → **Cambiar a "En revisión"**. | "Guardado." El estatus cambia a **En revisión**, las opciones ahora son **En atención**, **Canalizado** y **Descartado**, y la bitácora muestra tu comentario y tu correo. 📸 |
| 4.7 | Sin elegir estatus, escribe `Se programa recorrido` → **Agregar nota**. | "Guardado." Nueva entrada en la bitácora; el estatus sigue en **En revisión**. |
| 4.8 | Regresa con la flecha. | La bandeja muestra el reporte en **En revisión**. |
| 4.9 | Toca **Salir**. | Regresa al inicio. |

## 5. El ciudadano ve el cambio

| # | Pasos | Resultado esperado |
|---|---|---|
| 5.1 | **Consultar mi reporte** con el mismo folio y clave. | Estado **En revisión** e historial con dos renglones (Recibido, En revisión). **No** aparecen el comentario ni la nota del personal. 📸 |

## 6. Opcional: ciclo completo de estatus

Con el personal: **En atención** → **Concluido**. Luego, en el caso concluido, la única opción es **En atención** y exige un comentario (reincidencia). Con otro reporte puedes probar **Descartado** con motivo: después ya no aparece ninguna opción de cambio.

## Si algo falla

| Lo que ves | Causa probable | Qué hacer |
|---|---|---|
| El build falla con `25.0.3` | Gradle está usando JDK 25 | Paso 2.3 |
| "No hay conexión con el servidor…" | El emulador no tiene internet | Abre Chrome en el emulador y prueba cualquier página; reinicia el emulador (Cold Boot) |
| El aviso de privacidad no carga o la consulta da error inesperado | El backend nuevo no está desplegado | Paso 1 de esta guía |
| "Tu cuenta requiere un paso adicional…" | La contraseña no se fijó como permanente o se activó MFA | Runbook, paso 4 |
| "Tu cuenta no tiene un rol de personal SIPINNA asignado" | Falta el grupo | Runbook, paso 4 (`admin-add-user-to-group`) |
| "Demasiados intentos…" | 5 claves incorrectas para el mismo folio | Espera 15 minutos |
| Te regresa al login a mitad de la prueba | El token dura 60 minutos | Vuelve a iniciar sesión |
