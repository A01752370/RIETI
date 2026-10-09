package mx.sipinna.rieti.model

/**
 * Fila de la bandeja del personal (`GET /api/v1/reportes`).
 *
 * @property id identificador interno del reporte
 * @property folio folio público
 * @property estatus estatus vigente
 * @property ubicacion referencia del lugar de los hechos
 * @property actividad actividad observada
 * @property edadAproximada rango de edad
 * @property cantidadNinos cantidad aproximada de menores
 * @property situacionRiesgo "Sí", "No" o "No sé"
 * @property fechaCreacion fecha de registro (ISO-8601)
 * @property fechaActualizacion fecha del último cambio (ISO-8601)
 */
data class ReporteResumen(
    val id: Int,
    val folio: String,
    val estatus: String,
    val ubicacion: String,
    val actividad: String,
    val edadAproximada: String,
    val cantidadNinos: Int,
    val situacionRiesgo: String,
    val fechaCreacion: String,
    val fechaActualizacion: String
)

/**
 * Página de resultados.
 *
 * @property elementos filas de esta página
 * @property total total de filas que cumplen el filtro
 * @property pagina número de página (desde 1)
 * @property tamano elementos por página
 */
data class Pagina<T>(
    val elementos: List<T>,
    val total: Int,
    val pagina: Int,
    val tamano: Int
)

/**
 * Detalle de un reporte para el personal (`GET /api/v1/reportes/{id}`).
 *
 * @property transicionesPermitidas estatus a los que se puede cambiar desde el actual;
 *   los calcula el servidor con la máquina de estados, la app solo los muestra
 */
data class ReporteDetalle(
    val id: Int,
    val folio: String,
    val estatus: String,
    val ubicacion: String,
    val actividad: String,
    val edadAproximada: String,
    val cantidadNinos: Int,
    val situacionRiesgo: String,
    val fechaCreacion: String,
    val fechaActualizacion: String,
    val latitud: Double?,
    val longitud: Double?,
    val descripcion: String,
    val motivoDescarte: String?,
    val historial: List<EventoSeguimiento>,
    val transicionesPermitidas: List<String>
)

/**
 * Evento de la bitácora del caso (solo personal).
 *
 * @property estatus estatus del caso en ese momento
 * @property comentario nota registrada, o null
 * @property autor correo de quien la registró; null para el registro automático
 * @property fecha fecha del evento (ISO-8601)
 */
data class EventoSeguimiento(
    val estatus: String,
    val comentario: String?,
    val autor: String?,
    val fecha: String
)

/**
 * Cuerpo de `PATCH /api/v1/reportes/{id}/estatus`.
 *
 * @property estatus estatus destino (debe estar en [ReporteDetalle.transicionesPermitidas])
 * @property comentario comentario de seguimiento (opcional salvo al reabrir un caso concluido)
 * @property motivo motivo de descarte (obligatorio si [estatus] es "Descartado")
 */
data class CambiarEstatusRequest(
    val estatus: String,
    val comentario: String?,
    val motivo: String?
)

/**
 * Cuerpo de `POST /api/v1/reportes/{id}/seguimientos`.
 *
 * @property comentario texto de la nota
 */
data class AgregarSeguimientoRequest(
    val comentario: String
)
