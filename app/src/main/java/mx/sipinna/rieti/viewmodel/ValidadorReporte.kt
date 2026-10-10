package mx.sipinna.rieti.viewmodel

import java.text.Normalizer
import mx.sipinna.rieti.model.Municipio

/**
 * Reglas del formulario de reporte que se revisan en el teléfono antes de enviar.
 * El servidor vuelve a validar todo; esto solo evita viajes inútiles y da
 * mensajes claros. Es lógica pura, sin Android, para poder probarla.
 */
object ValidadorReporte {

    /** Opciones de cantidad que muestra el formulario y su valor aproximado. */
    val CANTIDADES = linkedMapOf("1" to 1, "2 a 3" to 2, "4 o más" to 4)

    /** Rangos de edad (catálogo `rango_edad`). */
    val EDADES = listOf("0-5", "6-11", "12-17")

    /** Actividades (catálogo `actividad`). */
    val ACTIVIDADES = listOf(
        "Mendicidad forzada", "Trabajo doméstico", "Venta ambulante",
        "Construcción", "Trabajo agrícola", "Otro"
    )

    /** Respuestas a "¿Percibes una situación de riesgo?" (catálogo `riesgo`). */
    val RIESGOS = listOf("Sí", "No", "No sé")

    /** Largo máximo de la descripción (igual que en el servidor). */
    const val MAX_DESCRIPCION = 2000

    /** Largo máximo de la referencia de ubicación (igual que en el servidor). */
    const val MAX_UBICACION = 300

    /**
     * Revisa los campos y devuelve la lista de problemas (vacía si todo está bien).
     *
     * @param municipio municipio elegido en el selector (D-16), o null
     * @param ubicacion referencia del lugar de los hechos
     * @param cantidad opción elegida de [CANTIDADES]
     * @param edad opción elegida de [EDADES]
     * @param actividad opción elegida de [ACTIVIDADES]
     * @param riesgo opción elegida de [RIESGOS]
     * @param descripcion descripción libre
     */
    fun validar(
        municipio: Municipio?,
        ubicacion: String,
        cantidad: String,
        edad: String,
        actividad: String,
        riesgo: String,
        descripcion: String
    ): List<String> = buildList {
        if (municipio == null) add("Elige el municipio donde ocurre")
        if (ubicacion.isBlank()) add("Indica el lugar de los hechos")
        if (ubicacion.length > MAX_UBICACION) add("La referencia del lugar es demasiado larga")
        if (cantidad !in CANTIDADES) add("Elige cuántas niñas o niños viste")
        if (edad !in EDADES) add("Elige la edad aproximada")
        if (actividad !in ACTIVIDADES) add("Elige la actividad que observaste")
        if (riesgo !in RIESGOS) add("Indica si percibes una situación de riesgo")
        if (descripcion.isBlank()) add("Describe brevemente lo que observaste")
        if (descripcion.length > MAX_DESCRIPCION) add("La descripción no debe pasar de $MAX_DESCRIPCION caracteres")
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
}
