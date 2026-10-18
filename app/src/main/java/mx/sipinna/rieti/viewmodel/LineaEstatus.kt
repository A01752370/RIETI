package mx.sipinna.rieti.viewmodel

/**
 * Catálogo único de estatus para la persona que reportó (Fase 5). Los textos son
 * los mismos que `web/src/estatus.tsx` (`SIGNIFICADO`) y explican qué significa
 * cada etapa **sin prometer tiempos**: no hay un plazo oficial de atención.
 */
object CatalogoEstatus {
    /** Avance normal de un reporte, en orden. "Descartado" no forma parte: es un final distinto. */
    val FLUJO = listOf("Recibido", "En revisión", "En atención", "Canalizado", "Concluido")

    /** Final distinto del avance normal. */
    const val DESCARTADO = "Descartado"

    /** Qué significa cada estatus, en lenguaje simple. */
    val SIGNIFICADO = mapOf(
        "Recibido" to "Tu reporte fue recibido y está en fila para que el personal del SIPINNA lo revise.",
        "En revisión" to "El personal del SIPINNA está revisando la información que enviaste.",
        "En atención" to "El SIPINNA está realizando acciones de atención relacionadas con tu reporte.",
        "Canalizado" to "El caso se turnó a la institución que corresponde para que lo atienda.",
        "Concluido" to "El SIPINNA terminó su intervención en este caso. Gracias por reportar.",
        DESCARTADO to "Después de revisarlo, el reporte no pudo atenderse; por ejemplo, porque la información no alcanzó " +
            "o ya había otro reporte del mismo caso. Si la situación continúa, puedes enviar un reporte nuevo."
    )

    /** Significado de un estatus; texto genérico si el servidor manda uno desconocido. */
    fun significado(estatus: String): String = SIGNIFICADO[estatus] ?: "Tu reporte está en seguimiento."
}

/** Cómo se dibuja cada paso de la línea de progreso. */
enum class EstadoPaso {
    /** Ya pasó por aquí: palomita y fecha. */
    ALCANZADO,

    /** Estatus vigente: resaltado, con fecha. */
    ACTUAL,

    /** Todavía no llega: atenuado, sin fecha. */
    PENDIENTE,

    /** El caso avanzó sin pasar por esta etapa (p. ej. de "En revisión" a "Canalizado"). */
    OMITIDO
}

/**
 * Un paso de la línea de progreso.
 *
 * @property estatus nombre del estatus
 * @property estado cómo se dibuja
 * @property fecha cuándo se alcanzó (ISO-8601), o null si no aplica
 */
data class PasoLinea(val estatus: String, val estado: EstadoPaso, val fecha: String?)

/**
 * Línea de progreso de un reporte, calculada solo con estatus y fechas (lo que
 * ya ve el ciudadano: nunca comentarios ni notas del personal).
 *
 * @property pasos pasos del avance normal (en un caso descartado, solo los que alcanzó)
 * @property descartado final "Descartado", o null si el caso no se descartó
 * @property significado frase en lenguaje simple sobre la etapa actual
 */
data class LineaEstatus(val pasos: List<PasoLinea>, val descartado: PasoLinea?, val significado: String) {
    /** Descripción para lectores de pantalla, p. ej. "Etapa 2 de 5: En revisión". */
    val descripcion: String
        get() = if (descartado != null) "Reporte descartado" else {
            val i = pasos.indexOfFirst { it.estado == EstadoPaso.ACTUAL }
            "Etapa ${i + 1} de ${pasos.size}: ${pasos.getOrNull(i)?.estatus ?: ""}"
        }

    companion object {
        /**
         * Calcula la línea a partir del estatus vigente y del historial público.
         *
         * @param actual estatus vigente
         * @param historial cambios (estatus, fecha ISO) del más antiguo al más reciente; puede venir vacío
         * @param fechaAlta fecha de registro, por si el historial viene vacío (pantalla de folio)
         */
        fun calcular(actual: String, historial: List<Pair<String, String>>, fechaAlta: String? = null): LineaEstatus {
            val ultimaFecha = { estatus: String -> historial.lastOrNull { it.first == estatus }?.second }
            val alcanzados = historial.map { it.first }.toSet() + actual
            val fechaDe = { estatus: String -> ultimaFecha(estatus) ?: if (estatus == "Recibido") fechaAlta else null }

            if (actual == CatalogoEstatus.DESCARTADO) {
                val pasos = CatalogoEstatus.FLUJO.filter { it in alcanzados || it == "Recibido" }
                    .map { PasoLinea(it, EstadoPaso.ALCANZADO, fechaDe(it)) }
                return LineaEstatus(
                    pasos,
                    PasoLinea(CatalogoEstatus.DESCARTADO, EstadoPaso.ACTUAL, ultimaFecha(CatalogoEstatus.DESCARTADO)),
                    CatalogoEstatus.significado(actual)
                )
            }
            val indice = CatalogoEstatus.FLUJO.indexOf(actual).coerceAtLeast(0)
            val pasos = CatalogoEstatus.FLUJO.mapIndexed { i, estatus ->
                when {
                    i == indice -> PasoLinea(estatus, EstadoPaso.ACTUAL, fechaDe(estatus))
                    i > indice -> PasoLinea(estatus, EstadoPaso.PENDIENTE, null)
                    estatus in alcanzados || estatus == "Recibido" -> PasoLinea(estatus, EstadoPaso.ALCANZADO, fechaDe(estatus))
                    else -> PasoLinea(estatus, EstadoPaso.OMITIDO, null)
                }
            }
            return LineaEstatus(pasos, null, CatalogoEstatus.significado(actual))
        }
    }
}
