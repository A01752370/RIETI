package mx.sipinna.rieti.viewmodel

import java.text.Normalizer
import mx.sipinna.rieti.model.GrupoMenores
import mx.sipinna.rieti.model.Municipio

/**
 * Datos de dirección tal como se capturan en el formulario (texto libre de cada campo).
 *
 * @property calle calle o avenida
 * @property numero número exterior (opcional)
 * @property colonia colonia o barrio
 * @property codigoPostal código postal
 * @property referencias referencias del lugar (opcional)
 */
data class DatosDireccion(
    val calle: String = "",
    val numero: String = "",
    val colonia: String = "",
    val codigoPostal: String = "",
    val referencias: String = ""
)

/** Campo del formulario al que se refiere un problema (para mostrar el error junto a él). */
enum class CampoReporte { MUNICIPIO, CALLE, COLONIA, CODIGO_POSTAL, DIRECCION, GRUPOS, ACTIVIDAD, ACTIVIDAD_OTRO, RIESGO, DESCRIPCION }

/**
 * Problema de validación.
 *
 * @property campo campo que lo causa
 * @property mensaje texto para la persona (los mismos mensajes de siempre)
 */
data class Problema(val campo: CampoReporte, val mensaje: String)

/**
 * Reglas del formulario de reporte que se revisan en el teléfono antes de enviar.
 * El servidor vuelve a validar todo; esto solo evita viajes inútiles y da
 * mensajes claros. Es lógica pura, sin Android, para poder probarla.
 */
object ValidadorReporte {

    /** Rangos de edad (catálogo `rango_edad`), en el orden en que se muestran. */
    val EDADES = listOf("0-5", "6-11", "12-17", "Sin determinar")

    /** Texto amable de cada rango para la pantalla. */
    val ETIQUETAS_EDAD = mapOf(
        "0-5" to "De 0 a 5 años",
        "6-11" to "De 6 a 11 años",
        "12-17" to "De 12 a 17 años",
        "Sin determinar" to "No estoy seguro/a de la edad"
    )

    /** Tope de menores en un reporte (igual que en el servidor). */
    const val TOTAL_MAXIMO = 50

    /**
     * Catálogo de actividades de respaldo, por si no se puede descargar el del
     * servidor (`GET /api/v1/catalogos/actividades`). Mismo orden: "Otro" al final.
     */
    val ACTIVIDADES_RESPALDO = listOf(
        "Venta ambulante",
        "Mendicidad forzada",
        "Limpieza de parabrisas o actividades en cruceros",
        "Trabajo en mercados o tianguis",
        "Comercio familiar",
        "Servicio en comercios o restaurantes",
        "Cargador o carretillero",
        "Reciclaje o pepena",
        "Trabajo doméstico",
        "Construcción",
        "Trabajo agrícola",
        "Talleres mecánicos",
        "Trabajo nocturno o en bares",
        "Actividades ilícitas o explotación",
        "Otro"
    )

    /** Actividad que pide una descripción libre. */
    const val ACTIVIDAD_OTRO = "Otro"

    /** Respuestas a "¿Percibes una situación de riesgo?" (catálogo `riesgo`). */
    val RIESGOS = listOf("Sí", "No", "No sé")

    /** Largos máximos (iguales que en el servidor). */
    const val MAX_DESCRIPCION = 2000
    const val MAX_CALLE = 120
    const val MAX_NUMERO = 20
    const val MAX_COLONIA = 120
    const val MAX_REFERENCIAS = 300
    const val MAX_ACTIVIDAD_OTRO = 120

    /** Suma de menores de todos los grupos. */
    fun total(conteos: Map<String, Int>): Int = conteos.values.sum()

    /** ¿Se puede sumar uno más sin pasar del tope? */
    fun puedeAumentar(conteos: Map<String, Int>): Boolean = total(conteos) < TOTAL_MAXIMO

    /** Grupos a enviar: solo los rangos con al menos uno, en el orden de [EDADES]. */
    fun gruposParaEnviar(conteos: Map<String, Int>): List<GrupoMenores> =
        EDADES.mapNotNull { r -> conteos[r]?.takeIf { it > 0 }?.let { GrupoMenores(r, it) } }

    /** Los códigos postales del Estado de México van de 50000 a 57999. */
    fun esCodigoPostalEdomex(cp: String): Boolean =
        Regex("^\\d{5}$").matches(cp) && cp.toInt() in 50000..57999

    /**
     * Revisa los campos y devuelve la lista de problemas (vacía si todo está bien).
     * Es la unión, en orden, de [problemasDonde], [problemasQuienes] y [problemasQue].
     *
     * @param municipio municipio elegido en el selector (D-16), o null
     * @param direccion campos de la dirección
     * @param conteos menores por rango de edad
     * @param actividad actividad elegida
     * @param actividadOtro descripción si la actividad es "Otro"
     * @param actividades catálogo vigente (del servidor o de respaldo)
     * @param riesgo opción elegida de [RIESGOS]
     * @param descripcion descripción libre
     */
    fun validar(
        municipio: Municipio?,
        direccion: DatosDireccion,
        conteos: Map<String, Int>,
        actividad: String,
        actividadOtro: String,
        actividades: List<String>,
        riesgo: String,
        descripcion: String
    ): List<String> = (
        problemasDonde(municipio, direccion) + problemasQuienes(conteos) +
            problemasQue(actividad, actividadOtro, actividades, riesgo, descripcion)
        ).map { it.mensaje }

    /** Paso "Dónde" del asistente: municipio y dirección. */
    fun problemasDonde(municipio: Municipio?, direccion: DatosDireccion): List<Problema> = buildList {
        if (municipio == null) add(Problema(CampoReporte.MUNICIPIO, "Elige el municipio donde ocurre"))
        if (direccion.calle.isBlank()) add(Problema(CampoReporte.CALLE, "Escribe la calle"))
        if (direccion.colonia.isBlank()) add(Problema(CampoReporte.COLONIA, "Escribe la colonia"))
        val cp = direccion.codigoPostal.trim()
        when {
            cp.isEmpty() -> add(Problema(CampoReporte.CODIGO_POSTAL, "Escribe el código postal"))
            !Regex("^\\d{5}$").matches(cp) -> add(Problema(CampoReporte.CODIGO_POSTAL, "El código postal debe tener 5 dígitos"))
            !esCodigoPostalEdomex(cp) ->
                add(Problema(CampoReporte.CODIGO_POSTAL, "El código postal no es del Estado de México (empieza con 50 a 57)"))
        }
        if (direccion.calle.length > MAX_CALLE || direccion.colonia.length > MAX_COLONIA ||
            direccion.numero.length > MAX_NUMERO || direccion.referencias.length > MAX_REFERENCIAS
        ) add(Problema(CampoReporte.DIRECCION, "Algún dato de la dirección es demasiado largo"))
    }

    /** Paso "A quiénes" del asistente: menores por grupo de edad. */
    fun problemasQuienes(conteos: Map<String, Int>): List<Problema> = buildList {
        val suma = total(conteos)
        if (suma < 1) add(Problema(CampoReporte.GRUPOS, "Indica cuántas niñas, niños o adolescentes viste"))
        if (suma > TOTAL_MAXIMO) add(Problema(CampoReporte.GRUPOS, "El total no puede pasar de $TOTAL_MAXIMO"))
    }

    /** Paso "Qué ocurre" del asistente: actividad, riesgo y descripción. */
    fun problemasQue(
        actividad: String,
        actividadOtro: String,
        actividades: List<String>,
        riesgo: String,
        descripcion: String
    ): List<Problema> = buildList {
        if (actividad !in actividades) add(Problema(CampoReporte.ACTIVIDAD, "Elige la actividad que observaste"))
        if (actividad == ACTIVIDAD_OTRO && actividadOtro.isBlank()) {
            add(Problema(CampoReporte.ACTIVIDAD_OTRO, "Describe la actividad que observaste"))
        }
        if (actividadOtro.length > MAX_ACTIVIDAD_OTRO) {
            add(Problema(CampoReporte.ACTIVIDAD_OTRO, "La descripción de la actividad es demasiado larga"))
        }
        if (riesgo !in RIESGOS) add(Problema(CampoReporte.RIESGO, "Indica si percibes una situación de riesgo"))
        if (descripcion.isBlank()) add(Problema(CampoReporte.DESCRIPCION, "Describe brevemente lo que observaste"))
        if (descripcion.length > MAX_DESCRIPCION) {
            add(Problema(CampoReporte.DESCRIPCION, "La descripción no debe pasar de $MAX_DESCRIPCION caracteres"))
        }
    }

    /** Quita acentos y mayúsculas para buscar ("atizapan" encuentra "Atizapán"). */
    fun normalizar(texto: String): String =
        Normalizer.normalize(texto, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().trim()

    /**
     * Municipios cuyo nombre contiene el texto, primero los que empiezan con él
     * (misma regla que la web).
     */
    fun filtrarMunicipios(municipios: List<Municipio>, texto: String): List<Municipio> {
        val q = normalizar(texto)
        if (q.isEmpty()) return municipios
        val coinciden = municipios.filter { normalizar(it.nombre).contains(q) }
        return coinciden.filter { normalizar(it.nombre).startsWith(q) } + coinciden.filterNot { normalizar(it.nombre).startsWith(q) }
    }

    /**
     * Normaliza un folio escrito a mano: mayúsculas y sin espacios.
     * Devuelve null si no tiene el formato `RIETI-AAAA-NNNNNN`.
     */
    fun normalizarFolio(texto: String): String? {
        val folio = texto.trim().uppercase().replace(" ", "")
        return folio.takeIf { Regex("^RIETI-\\d{4}-\\d{6}$").matches(it) }
    }

    /**
     * Rellena con la sugerencia del mapa solo los campos que la persona no ha escrito,
     * para nunca borrar lo que ya capturó a mano.
     *
     * @param actual dirección actual del formulario
     * @param editados nombres de los campos que la persona editó ("calle", "numero", "colonia", "codigoPostal")
     */
    fun aplicarSugerencia(
        actual: DatosDireccion,
        editados: Set<String>,
        calle: String?,
        numero: String?,
        colonia: String?,
        codigoPostal: String?
    ): DatosDireccion = actual.copy(
        calle = if ("calle" in editados || calle.isNullOrBlank()) actual.calle else calle,
        numero = if ("numero" in editados || numero.isNullOrBlank()) actual.numero else numero,
        colonia = if ("colonia" in editados || colonia.isNullOrBlank()) actual.colonia else colonia,
        codigoPostal = if ("codigoPostal" in editados || codigoPostal.isNullOrBlank()) actual.codigoPostal else codigoPostal
    )
}
