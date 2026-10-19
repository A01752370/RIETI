package mx.sipinna.rieti.viewmodel

/**
 * Reglas de las fotos opcionales (Fase 8), sin Android, para probarlas en la JVM.
 * El servidor vuelve a validar el tipo real y re-codifica cada foto.
 */
object ReglasFotos {

    /** Advertencia del socio formador: se lee y se acepta antes de elegir fotos. */
    const val ADVERTENCIA =
        "Evita tomar fotografías que pongan en riesgo a niñas, niños o adolescentes. No confrontes a las personas involucradas " +
            "ni te expongas para obtener evidencia. La fotografía es opcional y preferentemente del lugar o sitio donde viste a la " +
            "niña, niño o adolescente en situación de trabajo para facilitar a las Autoridades su localización."

    /** Fotos por reporte. */
    const val MAXIMO = 3

    /** Lado mayor (px) de la foto que se sube; las más grandes se reducen en el teléfono. */
    const val LADO_MAXIMO = 2048

    /** Tamaño máximo que acepta el almacén por foto (el teléfono la comprime antes). */
    const val MAX_BYTES = 5 * 1024 * 1024

    /** Cuántas fotos más se pueden agregar. */
    fun restantes(actuales: Int): Int = (MAXIMO - actuales).coerceAtLeast(0)

    /**
     * Factor de muestreo (potencia de 2) para decodificar una imagen grande sin agotar la
     * memoria, de modo que su lado mayor quede cerca de [LADO_MAXIMO] sin bajar de él.
     */
    fun muestreo(ancho: Int, alto: Int): Int {
        var factor = 1
        while (maxOf(ancho, alto) / (factor * 2) >= LADO_MAXIMO) factor *= 2
        return factor
    }

    /** Medidas finales que caben en [LADO_MAXIMO] conservando la proporción (no agranda). */
    fun medidas(ancho: Int, alto: Int): Pair<Int, Int> {
        val escala = minOf(1.0, LADO_MAXIMO.toDouble() / maxOf(ancho, alto))
        return Pair(maxOf(1, Math.round(ancho * escala).toInt()), maxOf(1, Math.round(alto * escala).toInt()))
    }

    /** Mensaje para la confirmación según cuántas fotos se adjuntaron (-1 = falló la subida). */
    fun mensajeConfirmacion(fotos: Int): String? = when {
        fotos < 0 -> "Tu reporte sí quedó registrado, pero no se pudieron adjuntar las fotos."
        fotos == 0 -> null
        fotos == 1 -> "Se adjuntó 1 foto al reporte."
        else -> "Se adjuntaron $fotos fotos al reporte."
    }
}
