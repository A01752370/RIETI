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
enum class CampoReporte {
    MODO, MUNICIPIO, CALLE, COLONIA, CODIGO_POSTAL, DIRECCION, PELIGRO, CANTIDAD, EDADES, GRUPOS, ACTIVIDAD, ACTIVIDAD_OTRO, RIESGO, DESCRIPCION
}

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

    /** Rangos de edad vigentes (catálogo `rango_edad`, Fase 6), en el orden en que se muestran. */
    val EDADES = listOf("0-5", "6-11", "12-14", "15-17", "Sin determinar")

    /** Orden para enviar y mostrar, incluido el rango heredado `12-17` (reportes anteriores). */
    private val ORDEN_EDADES = listOf("0-5", "6-11", "12-14", "15-17", "12-17", "Sin determinar")

    /** Texto amable de cada rango para la pantalla ("Sin determinar" es el "No sé" del formulario). */
    val ETIQUETAS_EDAD = mapOf(
        "0-5" to "De 0 a 5 años",
        "6-11" to "De 6 a 11 años",
        "12-14" to "De 12 a 14 años",
        "15-17" to "De 15 a 17 años",
        "12-17" to "De 12 a 17 años",
        "Sin determinar" to "Edad sin determinar"
    )

    /** Texto corto de cada rango para los chips del formulario. */
    val CHIPS_EDAD = mapOf("0-5" to "0–5", "6-11" to "6–11", "12-14" to "12–14", "15-17" to "15–17", "Sin determinar" to "No sé")

    /** Categorías de "¿Cuántas viste?" (Fase 6). */
    val CANTIDADES = listOf("1", "2", "3", "4", "5+", "No sé")

    /** Texto de cada categoría de cantidad. */
    val TEXTO_CANTIDAD = mapOf("5+" to "5 o más")

    /** Respuestas a "¿Está en peligro inmediato?" (Fase 6). */
    val PELIGRO = listOf("Sí", "No", "No sé")

    /** Tope de menores en un reporte (igual que en el servidor). */
    const val TOTAL_MAXIMO = 50

    /**
     * Catálogo de actividades de respaldo, por si no se puede descargar el del
     * servidor (`GET /api/v1/catalogos/actividades`). Mismo orden: "Otro" al final.
     */
    val ACTIVIDADES_RESPALDO = listOf(
        "Venta ambulante",
        "Limpieza de parabrisas o actividades en cruceros",
        "Mendicidad",
        "Carga y descarga",
        "Trabajo en comercio",
        "Trabajo en mercados o tianguis",
        "Trabajo agrícola",
        "Construcción",
        "Trabajo doméstico",
        "Recolección de residuos",
        "Talleres mecánicos",
        "Trabajo nocturno o en bares",
        "Otro",
        "No sé"
    )

    /** Texto que se muestra para una actividad ("Otro" se presenta como "Otra actividad"). */
    fun textoActividad(actividad: String): String = if (actividad == ACTIVIDAD_OTRO) "Otra actividad" else actividad

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

    /** Grupos a enviar: solo los rangos con al menos uno, en orden de edad. */
    fun gruposParaEnviar(conteos: Map<String, Int>): List<GrupoMenores> =
        ORDEN_EDADES.mapNotNull { r -> conteos[r]?.takeIf { it > 0 }?.let { GrupoMenores(r, it) } }

    /**
     * Grupos de edad a partir de lo que pide el formulario del socio (Fase 6): con una sola edad
     * elegida, la cantidad va toda a esa edad (`5 o más` cuenta como 5 y `No sé` como 1, la cota
     * mínima); con varias edades, se usan los contadores por edad.
     */
    fun gruposDesdeFormulario(cantidad: String, edades: Set<String>, conteos: Map<String, Int>): List<GrupoMenores> {
        if (edades.size == 1) {
            val n = when (cantidad) { "5+" -> 5; "No sé" -> 1; else -> cantidad.toIntOrNull() ?: 0 }
            return if (n > 0) listOf(GrupoMenores(edades.single(), n)) else emptyList()
        }
        return gruposParaEnviar(conteos.filterKeys { it in edades })
    }

    /**
     * Paso "A quiénes" del asistente (Fase 6): peligro inmediato, cantidad y edad aproximada.
     * Con varias edades, los contadores deben cuadrar con la cantidad (las mismas reglas que el servidor).
     */
    fun problemasMenores(peligro: String, cantidad: String, edades: Set<String>, conteos: Map<String, Int>): List<Problema> = buildList {
        if (peligro !in PELIGRO) add(Problema(CampoReporte.PELIGRO, "Indica si está en peligro inmediato"))
        if (cantidad !in CANTIDADES) add(Problema(CampoReporte.CANTIDAD, "Indica cuántas niñas, niños o adolescentes viste"))
        if (edades.isEmpty()) add(Problema(CampoReporte.EDADES, "Indica la edad aproximada"))
        if (edades.size > 1 && cantidad in CANTIDADES) {
            val porEdad = edades.associateWith { conteos[it] ?: 0 }
            val suma = porEdad.values.sum()
            val cuadra = when (cantidad) {
                "No sé" -> true
                "5+" -> suma >= 5
                else -> suma == cantidad.toInt()
            }
            when {
                porEdad.values.any { it < 1 } -> add(Problema(CampoReporte.GRUPOS, "Indica cuántas hay en cada edad que elegiste"))
                !cuadra -> add(Problema(CampoReporte.GRUPOS, "La suma por edad ($suma) no coincide con la cantidad que indicaste"))
                suma > TOTAL_MAXIMO -> add(Problema(CampoReporte.GRUPOS, "El total no puede pasar de $TOTAL_MAXIMO"))
            }
        }
    }

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
     * Devuelve null si no tiene el formato `RIETI-ATZ-AAAA-NNNNNN` ni el heredado `RIETI-AAAA-NNNNNN`.
     */
    fun normalizarFolio(texto: String): String? {
        val folio = texto.trim().uppercase().replace(" ", "")
        return folio.takeIf { Regex("^RIETI-(?:[A-Z]{3}-)?\\d{4}-\\d{6}$").matches(it) }
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
