package mx.sipinna.rieti.model

/**
 * Representa un reporte de posible trabajo infantil, tal como lo devuelve el backend.
 *
 * Refleja el DTO plano `ReporteRespuestaDto` que expone el API (NestJS): aunque
 * en el backend la información está normalizada en varias tablas (Reporte,
 * Ubicacion, Caso, Seguimiento, catálogos), el endpoint regresa un solo
 * objeto "plano" para simplificar el consumo desde la app.
 *
 * @property id identificador interno del reporte en la base de datos
 * @property folio folio público del caso, formato "RIETI-<año>-<consecutivo>"
 * @property ubicacion descripción de la ubicación reportada (texto libre)
 * @property latitud latitud capturada por GPS al registrar el reporte, o null si no se capturó
 * @property longitud longitud capturada por GPS al registrar el reporte, o null si no se capturó
 * @property cantidadNinos cantidad aproximada de niñas/niños observados (RF-05)
 * @property edadAproximada rango de edad aproximado seleccionado en el formulario
 * @property actividad tipo de actividad observada (catálogo "Actividad")
 * @property situacionRiesgo si la persona que reporta percibió una situación de riesgo
 * @property descripcion descripción libre del hecho reportado
 * @property estatus estatus actual del caso (catálogo "EstatusReporte")
 * @property comentarioAdmin último comentario de seguimiento registrado por personal SIPINNA
 * @property fechaCreacion fecha de creación del reporte (ISO-8601)
 * @property fechaActualizacion fecha de la última actualización (ISO-8601)
 */
data class Reporte(
    val id: Int = 0,
    val folio: String = "",
    val ubicacion: String = "",
    val latitud: Double? = null,
    val longitud: Double? = null,
    val cantidadNinos: Int = 0,
    val edadAproximada: String = "",
    val actividad: String = "",
    val situacionRiesgo: String = "",
    val descripcion: String = "",
    val estatus: String = "",
    val comentarioAdmin: String? = null,
    val fechaCreacion: String = "",
    val fechaActualizacion: String = ""
)
