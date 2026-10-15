package mx.sipinna.rieti.model

/**
 * Cuerpo de `POST /api/v1/reportes` (CU-04: registrar reporte anónimo), con el
 * formato de la Fase 2: grupos de edad y dirección estructurada. El servidor
 * deriva el texto de ubicación, el total y el rango principal.
 *
 * No incluye ningún dato de quien reporta ni identificadores del dispositivo
 * (RNF-29). `latitud`/`longitud` son las del **lugar de los hechos** (marcador
 * del mapa o "Usar mi ubicación"). Gson omite los campos `null`.
 *
 * @property municipioId municipio donde ocurre (D-16), `id` de `GET /api/v1/catalogos/municipios`
 * @property direccion calle, número, colonia, código postal y referencias
 * @property latitud latitud del lugar de los hechos, o null
 * @property longitud longitud del lugar de los hechos, o null
 * @property grupos menores por grupo de edad (total ≤ 50)
 * @property actividad actividad observada (`GET /api/v1/catalogos/actividades`)
 * @property actividadOtro descripción cuando la actividad es "Otro", o null
 * @property situacionRiesgo "Sí", "No" o "No sé"
 * @property descripcion descripción libre de lo observado
 * @property avisoPrivacidadVersion versión del aviso que la persona aceptó (RF-44)
 * @property vincularCuenta true solo si la persona activó "Vincular este reporte a mi cuenta" (Fase 4); null = anónimo
 */
data class CrearReporteRequest(
    val municipioId: Int?,
    val direccion: DireccionReporte,
    val latitud: Double?,
    val longitud: Double?,
    val grupos: List<GrupoMenores>,
    val actividad: String,
    val actividadOtro: String?,
    val situacionRiesgo: String,
    val descripcion: String,
    val avisoPrivacidadVersion: String,
    val vincularCuenta: Boolean? = null
)

/**
 * Menores observados en un grupo de edad.
 *
 * @property rango "0-5", "6-11", "12-17" o "Sin determinar"
 * @property cantidad cuántos (≥ 1)
 */
data class GrupoMenores(val rango: String, val cantidad: Int)

/**
 * Dirección del lugar de los hechos. Se autorrellena desde el mapa y es editable.
 *
 * @property calle calle o avenida
 * @property numeroExterior número exterior, o null
 * @property colonia colonia o barrio
 * @property codigoPostal 5 dígitos, del Estado de México
 * @property referencias referencias para encontrar el lugar, o null
 */
data class DireccionReporte(
    val calle: String,
    val numeroExterior: String?,
    val colonia: String,
    val codigoPostal: String,
    val referencias: String?
)

/**
 * Actividad del catálogo (`GET /api/v1/catalogos/actividades`).
 *
 * @property nombre nombre que se envía en [CrearReporteRequest.actividad]
 * @property requiereDetalle true para "Otro": el formulario pide describirla
 */
data class Actividad(val nombre: String, val requiereDetalle: Boolean)

/**
 * Respuesta de `GET /api/v1/geo/reversa`: dirección sugerida (OpenStreetMap,
 * consultado por el servidor) y municipio donde cae el punto (polígonos del INEGI).
 *
 * @property direccion campos sugeridos; cualquiera puede venir null
 * @property municipioSugerido municipio del catálogo donde cae el punto, o null
 * @property direccionDisponible false si el servicio de direcciones no respondió
 * @property atribucion texto de atribución de los datos del mapa
 */
data class GeoReversa(
    val direccion: DireccionSugerida,
    val municipioSugerido: MunicipioSugerido?,
    val direccionDisponible: Boolean,
    val atribucion: String
)

/** Dirección sugerida por la geocodificación inversa. */
data class DireccionSugerida(
    val calle: String?,
    val numeroExterior: String?,
    val colonia: String?,
    val codigoPostal: String?
)

/** Municipio donde cae un punto del mapa. */
data class MunicipioSugerido(val id: Int, val nombre: String)

/**
 * Municipio del catálogo (D-16): los 125 del Estado de México con su clave INEGI.
 *
 * @property id identificador que se envía en [CrearReporteRequest.municipioId]
 * @property clave clave geoestadística de INEGI (`15xxx`)
 * @property nombre nombre oficial del municipio
 */
data class Municipio(
    val id: Int,
    val clave: String?,
    val nombre: String
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
 * @property secciones el mismo texto agrupado con títulos; null si el servidor es anterior a este campo
 */
data class AvisoPrivacidad(
    val version: String,
    val parrafos: List<String>,
    val secciones: List<SeccionAviso>? = null
) {
    /** Secciones a mostrar: las del servidor o, si no vienen, una sola sección sin título. */
    fun seccionesParaMostrar(): List<SeccionAviso> =
        secciones?.takeIf { it.isNotEmpty() } ?: listOf(SeccionAviso(titulo = "", parrafos = parrafos))
}

/**
 * Sección del aviso de privacidad.
 *
 * @property titulo título corto (vacío si no hay)
 * @property parrafos párrafos de la sección
 */
data class SeccionAviso(
    val titulo: String,
    val parrafos: List<String>
)
