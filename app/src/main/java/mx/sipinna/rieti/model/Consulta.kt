package mx.sipinna.rieti.model

/**
 * Cuerpo de `POST /api/v1/reportes/consulta` (CU-08).
 *
 * Se envía por POST, no en la URL, para que la clave no quede en logs.
 *
 * @property folio folio `RIETI-AAAA-NNNNNN` (el servidor acepta minúsculas)
 * @property clave clave de consulta (se aceptan minúsculas, espacios y guiones)
 */
data class ConsultaRequest(
    val folio: String,
    val clave: String
)

/**
 * Lo que ve el ciudadano de su reporte: solo estatus y fechas (RF-38).
 * Nunca incluye la descripción, la ubicación ni los comentarios del personal.
 *
 * @property folio folio consultado
 * @property estatus estatus vigente
 * @property fechaCreacion fecha de registro (ISO-8601)
 * @property fechaActualizacion fecha del último cambio (ISO-8601)
 * @property historial cambios de estatus, del más antiguo al más reciente
 */
data class ConsultaPublica(
    val folio: String,
    val estatus: String,
    val fechaCreacion: String,
    val fechaActualizacion: String,
    val historial: List<EventoPublico>
)

/**
 * Un cambio de estatus visible para el ciudadano.
 *
 * @property estatus estatus alcanzado
 * @property fecha fecha del cambio (ISO-8601)
 */
data class EventoPublico(
    val estatus: String,
    val fecha: String
)
