package mx.sipinna.rieti.viewmodel

import mx.sipinna.rieti.model.DireccionRespuesta
import mx.sipinna.rieti.model.GrupoMenores
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

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

    /**
     * Tiempo transcurrido desde una fecha, medido (no es un plazo ni una promesa):
     * "menos de 1 min", "45 min", "5 h", "3 días y 4 h", "21 días".
     *
     * @param desdeIso fecha ISO-8601 del API
     * @param ahora instante de referencia (se inyecta en las pruebas)
     * @return el texto, o null si la fecha no se puede leer
     */
    fun transcurrido(desdeIso: String, ahora: Instant = Instant.now()): String? {
        val desde = try { OffsetDateTime.parse(desdeIso).toInstant() } catch (e: Exception) { return null }
        val minutos = Duration.between(desde, ahora).toMinutes().coerceAtLeast(0)
        val horas = minutos / 60
        val dias = horas / 24
        return when {
            minutos < 1 -> "menos de 1 min"
            minutos < 60 -> "$minutos min"
            horas < 24 -> "$horas h"
            dias < 7 && horas % 24 > 0 -> "$dias ${if (dias == 1L) "día" else "días"} y ${horas % 24} h"
            else -> "$dias ${if (dias == 1L) "día" else "días"}"
        }
    }

    /** Proporción de cada grupo de edad sobre el total, para las barras del detalle (0 a 1). */
    fun proporciones(grupos: List<GrupoMenores>): List<Pair<GrupoMenores, Float>> {
        val total = grupos.sumOf { it.cantidad }.coerceAtLeast(1)
        return grupos.map { it to it.cantidad / total.toFloat() }
    }
}
