package mx.sipinna.rieti.model

/**
 * Cuerpo de la petición para actualizar el seguimiento de un caso (CU-09/CU-10).
 *
 * @property estatus nuevo estatus a aplicar (catálogo "EstatusReporte")
 * @property comentarioAdmin comentario de seguimiento a registrar
 */
data class ActualizarReporteRequest(
    val estatus: String,
    val comentarioAdmin: String
)
