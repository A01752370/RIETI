package mx.sipinna.rieti.viewmodel

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
     * @param ubicacion referencia del lugar de los hechos
     * @param cantidad opción elegida de [CANTIDADES]
     * @param edad opción elegida de [EDADES]
     * @param actividad opción elegida de [ACTIVIDADES]
     * @param riesgo opción elegida de [RIESGOS]
     * @param descripcion descripción libre
     */
    fun validar(
        ubicacion: String,
        cantidad: String,
        edad: String,
        actividad: String,
        riesgo: String,
        descripcion: String
    ): List<String> = buildList {
        if (ubicacion.isBlank()) add("Indica el lugar de los hechos")
        if (ubicacion.length > MAX_UBICACION) add("La referencia del lugar es demasiado larga")
        if (cantidad !in CANTIDADES) add("Elige cuántas niñas o niños viste")
        if (edad !in EDADES) add("Elige la edad aproximada")
        if (actividad !in ACTIVIDADES) add("Elige la actividad que observaste")
        if (riesgo !in RIESGOS) add("Indica si percibes una situación de riesgo")
        if (descripcion.isBlank()) add("Describe brevemente lo que observaste")
        if (descripcion.length > MAX_DESCRIPCION) add("La descripción no debe pasar de $MAX_DESCRIPCION caracteres")
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
