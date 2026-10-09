package mx.sipinna.rieti.model

/**
 * Cuerpo de `POST /api/v1/reportes` (CU-04: registrar reporte anónimo).
 *
 * No incluye ningún dato de quien reporta ni identificadores del dispositivo
 * (RNF-29). `latitud`/`longitud` son las del **lugar de los hechos**: solo se
 * envían si la persona tocó "Usar mi ubicación actual" en el formulario.
 *
 * @property ubicacion referencia del lugar (calle, colonia, punto de referencia)
 * @property latitud latitud del lugar de los hechos, o null
 * @property longitud longitud del lugar de los hechos, o null
 * @property cantidadNinos cantidad aproximada de niñas/niños observados (RF-05)
 * @property edadAproximada rango de edad del catálogo ("0-5", "6-11", "12-17")
 * @property actividad actividad observada (catálogo de actividades)
 * @property situacionRiesgo "Sí", "No" o "No sé"
 * @property descripcion descripción libre de lo observado
 * @property avisoPrivacidadVersion versión del aviso que la persona aceptó (RF-44)
 */
data class CrearReporteRequest(
    val ubicacion: String,
    val latitud: Double?,
    val longitud: Double?,
    val cantidadNinos: Int,
    val edadAproximada: String,
    val actividad: String,
    val situacionRiesgo: String,
    val descripcion: String,
    val avisoPrivacidadVersion: String
)

/**
 * Respuesta de `POST /api/v1/reportes`.
 *
 * @property folio folio público `RIETI-AAAA-NNNNNN`
 * @property claveConsulta clave `XXXX-XXXX-XXXX`; el servidor solo guarda su hash, así que no se puede recuperar
 * @property estatus estatus inicial ("Recibido")
 * @property fechaCreacion fecha de registro en ISO-8601
 */
data class ReporteCreado(
    val folio: String,
    val claveConsulta: String,
    val estatus: String,
    val fechaCreacion: String
)

/**
 * Aviso de privacidad vigente (`GET /api/v1/avisos-privacidad/vigente`).
 *
 * @property version versión que se envía en [CrearReporteRequest.avisoPrivacidadVersion]
 * @property parrafos texto del aviso, un párrafo por elemento
 */
data class AvisoPrivacidad(
    val version: String,
    val parrafos: List<String>
)
