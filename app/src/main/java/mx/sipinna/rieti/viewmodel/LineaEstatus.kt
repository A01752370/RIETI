package mx.sipinna.rieti.viewmodel

/**
 * Catálogo único de estatus para la app (Fases 5 y 6). Los nombres internos son los
 * del servidor; lo que se muestra es la **etiqueta pública** del catálogo del socio
 * formador. Los significados son los mismos que `web/src/estatus.tsx` y explican
 * cada etapa **sin prometer tiempos**: no hay un plazo oficial de atención.
 */
object CatalogoEstatus {
    /** Avance normal de un reporte, en orden (nombres internos). */
    val FLUJO = listOf("Recibido", "En revisión", "En atención", "Canalizado", "Concluido")

    /** Cancelado (nombre interno "Descartado"): final distinto del avance normal. */
    const val DESCARTADO = "Descartado"

    /** Concluido y archivado: cierre definitivo. */
    const val ARCHIVADO = "Archivado"

    /** Un caso concluido que volvió a requerir atención. */
    const val REINCIDENTE = "Reincidente"

    /** Estatus que se muestran aparte de la línea normal. */
    val FINALES = listOf(DESCARTADO, ARCHIVADO, REINCIDENTE)

    /** Todos los estatus en el orden de los filtros (nombres internos). */
    val TODOS = FLUJO + listOf(DESCARTADO, ARCHIVADO, REINCIDENTE)

    /** Etiqueta pública de cada estatus (catálogo del socio formador). */
    val ETIQUETA = mapOf(
        "Recibido" to "Registrado",
        "En revisión" to "En revisión",
        "En atención" to "En seguimiento",
        "Canalizado" to "Canalizado",
        "Concluido" to "Concluido",
        DESCARTADO to "Cancelado",
        ARCHIVADO to "Archivado",
        REINCIDENTE to "Reincidente"
    )

    /** Qué significa cada estatus, en lenguaje simple. */
    val SIGNIFICADO = mapOf(
        "Recibido" to "Tu reporte fue registrado y está en fila para que el personal del SIPINNA lo revise.",
        "En revisión" to "El personal del SIPINNA está revisando la información que enviaste.",
        "En atención" to "El SIPINNA está dando seguimiento y realizando acciones relacionadas con tu reporte.",
        "Canalizado" to "El caso se turnó a la institución que corresponde para que lo atienda.",
        "Concluido" to "El SIPINNA terminó su intervención en este caso. Gracias por reportar.",
        DESCARTADO to "Después de revisarlo, el reporte no pudo atenderse; por ejemplo, porque la información no alcanzó " +
            "o ya había otro reporte del mismo caso. Si la situación continúa, puedes enviar un reporte nuevo.",
        ARCHIVADO to "El caso concluyó y su expediente se archivó. Si la situación vuelve a ocurrir, puedes enviar un reporte nuevo.",
        REINCIDENTE to "El caso ya había concluido, pero volvió a requerir atención y el SIPINNA lo retomó."
    )

    /** Etiqueta pública de un estatus (el mismo texto si el servidor manda uno desconocido). */
    fun etiqueta(estatus: String): String = ETIQUETA[estatus] ?: estatus

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
 * @property estatus nombre interno del estatus (la vista muestra [CatalogoEstatus.etiqueta])
 * @property estado cómo se dibuja
 * @property fecha cuándo se alcanzó (ISO-8601), o null si no aplica
 */
data class PasoLinea(val estatus: String, val estado: EstadoPaso, val fecha: String?)

/**
 * Línea de progreso de un reporte, calculada solo con estatus y fechas (lo que
 * ya ve el ciudadano: nunca comentarios ni notas del personal).
 *
 * @property pasos pasos del avance normal (en un caso cancelado o reincidente, solo los que alcanzó)
 * @property final Cancelado, Archivado o Reincidente, que se muestran aparte de la línea; null si no aplica
 * @property significado frase en lenguaje simple sobre la etapa actual
 */
data class LineaEstatus(val pasos: List<PasoLinea>, val final: PasoLinea?, val significado: String) {
    /** Compatibilidad con la Fase 5: el final "Cancelado". */
    val descartado: PasoLinea? get() = final?.takeIf { it.estatus == CatalogoEstatus.DESCARTADO }

    /** Descripción para lectores de pantalla, p. ej. "Etapa 2 de 5: En revisión". */
    val descripcion: String
        get() = when (final?.estatus) {
            CatalogoEstatus.DESCARTADO -> "Reporte cancelado"
            CatalogoEstatus.ARCHIVADO -> "Reporte concluido y archivado"
            CatalogoEstatus.REINCIDENTE -> "Reporte reincidente: volvió a requerir atención"
            else -> {
                val i = pasos.indexOfFirst { it.estado == EstadoPaso.ACTUAL }
                "Etapa ${i + 1} de ${pasos.size}: ${pasos.getOrNull(i)?.let { CatalogoEstatus.etiqueta(it.estatus) } ?: ""}"
            }
        }

    companion object {
        /**
         * Calcula la línea a partir del estatus vigente y del historial público.
         *
         * @param actual estatus vigente (nombre interno)
         * @param historial cambios (estatus, fecha ISO) del más antiguo al más reciente; puede venir vacío
         * @param fechaAlta fecha de registro, por si el historial viene vacío (pantalla de folio)
         */
        fun calcular(actual: String, historial: List<Pair<String, String>>, fechaAlta: String? = null): LineaEstatus {
            val ultimaFecha = { estatus: String -> historial.lastOrNull { it.first == estatus }?.second }
            val alcanzados = historial.map { it.first }.toSet() + actual
            val fechaDe = { estatus: String -> ultimaFecha(estatus) ?: if (estatus == "Recibido") fechaAlta else null }

            if (actual in CatalogoEstatus.FINALES) {
                // Archivado implica que el caso llegó a Concluido; en los otros finales solo se muestra lo alcanzado.
                val pasos = CatalogoEstatus.FLUJO.filter { it in alcanzados || it == "Recibido" }
                    .map { PasoLinea(it, EstadoPaso.ALCANZADO, fechaDe(it)) }
                return LineaEstatus(pasos, PasoLinea(actual, EstadoPaso.ACTUAL, ultimaFecha(actual)), CatalogoEstatus.significado(actual))
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
