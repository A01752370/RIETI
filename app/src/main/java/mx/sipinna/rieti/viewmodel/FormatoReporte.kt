package mx.sipinna.rieti.viewmodel

import mx.sipinna.rieti.model.DireccionRespuesta
import mx.sipinna.rieti.model.GrupoMenores

/** Textos del detalle de un reporte para el personal (lógica pura, probada). */
object FormatoReporte {

    /**
     * Menores por grupo: "2 de 0 a 5 años · 1 de 12 a 17 años (total 3)". Si el
     * servidor no manda grupos (versión anterior), usa el total y el rango heredados.
     */
    fun menores(grupos: List<GrupoMenores>?, cantidadNinos: Int, edadAproximada: String): String {
        val lista = grupos?.takeIf { it.isNotEmpty() } ?: listOf(GrupoMenores(edadAproximada, cantidadNinos))
        val partes = lista.map { g ->
            when (g.rango) {
                "Sin determinar" -> "${g.cantidad} de edad sin determinar"
                else -> "${g.cantidad} de ${g.rango.replace("-", " a ")} años"
            }
        }
        val total = lista.sumOf { it.cantidad }
        return if (lista.size == 1) partes.single() else "${partes.joinToString(" · ")} (total $total)"
    }

    /** "Otro: Malabares" cuando hay detalle; si no, el nombre de la actividad. */
    fun actividad(actividad: String, actividadOtro: String?): String =
        if (!actividadOtro.isNullOrBlank()) "$actividad: $actividadOtro" else actividad

    /** Dirección en una línea ("Av. López Mateos 12, Col. Centro, C.P. 52900"), o null si no hay. */
    fun direccion(d: DireccionRespuesta?): String? {
        if (d == null) return null
        val calle = listOfNotNull(d.calle, d.numeroExterior).filter { it.isNotBlank() }.joinToString(" ")
        val partes = listOfNotNull(
            calle.ifBlank { null },
            d.colonia?.takeIf { it.isNotBlank() }?.let { "Col. $it" },
            d.codigoPostal?.takeIf { it.isNotBlank() }?.let { "C.P. $it" }
        )
        return partes.joinToString(", ").ifBlank { null }
    }
}
