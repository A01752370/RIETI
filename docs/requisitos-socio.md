# Requisitos del socio formador: trazabilidad

Matriz de los documentos del socio formador ("Consideraciones" y "Lista de estatus de expedientes") contra lo que hace RIETI. **Estados:** Implementado · Parcial · Trabajo futuro · Decisión del equipo (con su motivo). Las decisiones están en [`PLAN-RIETI.md`](PLAN-RIETI.md) §2.4.

> Estado al cierre de la **Fase 8**. Las filas de la Fase 9 se actualizan al terminarla.

## A. Consideraciones

| # | Requisito | Estado | Dónde / notas |
|---|---|---|---|
| A0 | Herramienta intermunicipal de detección, canalización, seguimiento e inteligencia territorial; el ciudadano reporta rápido y la información técnica se genera del lado administrativo | Parcial | Reporte rápido (asistente de 5 pasos), bandeja, expediente, aislamiento por municipio, duplicidad, alertas, panel con embudo y mapa de calor. Inteligencia territorial ampliada: Fase 9 |
| A1.1 | Elegir cómo reportar: **anónimo** (sin nombre, teléfono ni correo) | Implementado | Paso "Cómo reportar" (app y web), anónimo por defecto (D-25, D-33) |
| A1.2 | **Con seguimiento**: solo correo o teléfono/WhatsApp para recibir folio y consultar avances | Parcial · Decisión del equipo | Con la **cuenta opcional** (correo + Mi panel) en la app. Sin teléfono/WhatsApp ni notificaciones: minimización y no hay canal de envío (D-33). En la web el reporte es anónimo |
| A1.3 | Pedir los mínimos datos personales | Implementado | No se pide nombre, teléfono ni dirección de quien reporta; la cuenta guarda solo el `sub` de Cognito (D-19) |
| A2.1 | Municipio → ubicación GPS/mapa → calle o referencia | Implementado | Paso "Dónde" (app con mapa y GPS; web con dirección) |
| A2.2 | Cuántos NNA: 1/2/3/4/5 o más/No sé | Implementado | Paso "A quiénes" (D-35) |
| A2.3 | Edad aproximada: 0–5/6–11/12–14/15–17/No sé | Implementado | Migración aditiva; 12–17 queda heredado (D-35) |
| A2.4 | Actividad (lista del socio, otra actividad, no sé) | Implementado | Catálogo servido por el backend con respaldo local en la app (D-35) |
| A2.5 | Situación de riesgo Sí/No/No sé | Implementado | Paso "Qué ocurre" |
| A2.6 | Descripción breve | Implementado | Máximo 2000 caracteres |
| A2.7 | Fotografía o evidencia opcional | Implementado | Hasta 3 fotos (app: selector del sistema y cámara por intent; web: archivo), validadas por contenido y re-codificadas sin metadatos en el servidor (D-42) |
| A2.8 | El ciudadano no determina jurídicamente si hay trabajo infantil | Implementado | Reporta lo que observa; la modalidad y la verificación las asigna el personal en el expediente (D-35, D-37) |
| A3 | Pregunta de **peligro inmediato** con aviso de que RIETI no sustituye emergencias ni la denuncia formal; queda como **prioridad alta** | Implementado | Pregunta, aviso y botón al 911 (app y web); prioridad Alta calculada por el servidor y destacada en bandeja, detalle y panel (D-32) |
| A4 | Geolocalización: ubicación actual, punto en el mapa o dirección; guardar latitud, longitud, municipio, colonia, fecha, hora, actividad, edad y riesgo | Implementado (app) · Parcial (web) | La web no tiene mapa en el formulario (D-26) |
| A5 | Mapa de calor institucional con niveles y filtros (periodo, municipio, edad, sexo, actividad, riesgo, horario, reincidencia, estatus, dependencia) | Parcial · Planeado (Fase 9) | Hoy: mapa de calor con celdas de ≈ 550 m y filtros de periodo, municipio, estatus, actividad y prioridad |
| A6 | Separar reporte de caso confirmado; indicadores de recibidos, verificados, casos y NNA canalizados | Implementado | Verificación independiente del estatus y embudo en el panel web e inicio de la app, sin duplicados (D-37, D-41) |
| A7 | Folio automático con clave municipal (`RIETI-ATZ-2026-000123`); el ciudadano solo ve estados generales | Implementado | D-31; la consulta solo muestra estatus y fechas (RF-38). Claves provisionales salvo ATZ, NAU, TLA y CIZ |
| A8 | WhatsApp como segunda puerta de entrada | Trabajo futuro · Decisión del equipo | Columna `canal` lista (`whatsapp` reservado) y arquitectura propuesta (D-34) |
| A9.1 | Minimización, aviso de privacidad, control de acceso por roles, cifrado | Implementado | Aviso versionado, RBAC, cifrado en tránsito y en reposo |
| A9.2 | Bitácora de accesos y modificaciones | Implementado | Modificaciones: bitácora append-only con cambios de estatus, notas, acciones y cambios de expediente. Accesos: `acceso_expediente` append-only, solo Administrador (D-40) |
| A9.3 | Políticas de conservación y eliminación | Parcial | Bitácora de accesos (365 días, parametrizable) y fotos (365 días por ciclo de vida de S3) con plazos provisionales; la política general sigue pendiente del socio |
| A9.4 | Advertencia antes de subir fotos; fotos nunca en mapas ni tableros públicos | Implementado | Texto del socio con casilla obligatoria antes de elegir fotos; solo el personal las ve con URL de 60 s registrada en la bitácora; nunca en mapas, tableros, exportaciones ni consulta (D-42) |
| A10.1 | Cada municipio ve lo suyo; coordinación regional ve agregados | Implementado · Decisión del equipo | Enlace municipal: solo sus municipios asignados (404 uniforme fuera de alcance). El Coordinador regional ve el detalle de todos los municipios, no solo agregados, porque coordina la canalización (D-36); asignaciones en Administración |
| A10.2 | Expediente digital (responsable, dependencia, acciones, seguimiento, resultado, cierre) | Implementado | Responsable, dependencia, acciones tipadas, fecha de seguimiento con vencidos, verificación, modalidad, NNA y resultado/cierre obligatorios, cada cambio en la bitácora (D-37) |
| A10.3 | Posible duplicidad | Implementado | Sugerencias por radio y ventana (150 m / 30 días, editables) y vínculo reversible; nunca se fusiona (D-38) |
| A10.4 | Alertas territoriales ("punto recurrente") | Implementado | 3 reportes en 150 m y 30 días (editables), solo para el personal con alcance; sin correos (D-39) |
| A10.5 | Base regional anonimizada | Planeado (Fase 9) | |

## B. Lista de estatus y modalidades

| # | Requisito | Estado | Dónde / notas |
|---|---|---|---|
| B1 | Estatus Registrado, En revisión, En seguimiento, Canalizado, Concluido, Archivado, Cancelado, Reincidente | Implementado | Etiqueta pública por estatus y máquina de estados nueva (D-30); por confirmar con el socio |
| B2 | Modalidades: mendicidad forzada, explotación sexual, trata, actividades ilícitas, trabajo peligroso, otra | Implementado | Catálogo `modalidad`; la asigna el personal en el expediente (D-37) |

## Pendientes que dependen del socio

- Confirmar el catálogo de estatus y su mapeo (D-30).
- Catálogo oficial de claves de municipio para el folio (D-31) y lista de dependencias de canalización (hoy provisional y editable; D-37).
- Qué municipios atiende cada enlace y quién tendrá el perfil de Coordinador regional (D-36).
- Definición de prioridad, de "primera revisión" y del mínimo de casos para promedios (D-28, D-32).
- Política de conservación y eliminación (reportes, fotos, bitácoras).
- Si el reporte con seguimiento debe incluir teléfono o WhatsApp, y con qué canal notificar (D-33).
- Validación jurídica del aviso de privacidad (debe mencionar las fotos opcionales) y del texto de advertencia de fotos.
- Plazo de conservación de las fotos (hoy 365 días provisional; D-42).
