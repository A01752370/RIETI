package mx.sipinna.rieti.model

/**
 * Cuerpo de la petición para crear un nuevo reporte (CU-04: Registrar reporte ciudadano).
 *
 * `latitud`/`longitud` vienen de [mx.sipinna.rieti.model.GestorUbicacion] cuando el
 * usuario otorgó permiso de ubicación; si no, se envían como null y el reporte
 * queda solo con la ubicación en texto libre.
 *
 * @property ubicacion texto libre o dirección capturada en el formulario
 * @property latitud latitud GPS capturada, o null si no está disponible
 * @property longitud longitud GPS capturada, o null si no está disponible
 * @property cantidadNinos cantidad de niñas/niños observados, seleccionada en los chips
 * @property edadAproximada rango de edad seleccionado en los chips
 * @property actividad actividad observada, seleccionada en los chips
 * @property situacionRiesgo respuesta Sí/No/No sé seleccionada en los chips
 * @property descripcion descripción libre escrita por quien reporta
 */
data class CrearReporteRequest(
    val ubicacion: String,
    val latitud: Double?,
    val longitud: Double?,
    val cantidadNinos: Int,
    val edadAproximada: String,
    val actividad: String,
    val situacionRiesgo: String,
    val descripcion: String
)
