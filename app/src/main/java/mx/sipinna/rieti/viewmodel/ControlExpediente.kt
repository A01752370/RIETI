package mx.sipinna.rieti.viewmodel

import mx.sipinna.rieti.model.EventoSeguimiento

/**
 * Reglas puras del control rápido del expediente en la app (Fase 7), sin Android,
 * para probarlas en la JVM. El servidor vuelve a validar todo.
 */
object ControlExpediente {

    /** Verificación del expediente, en el orden del proceso. */
    val VERIFICACIONES = listOf("Sin verificar", "Verificado", "Caso confirmado", "No procede")

    /** Tipos de acción sugeridos para "Registrar acción" (el texto queda como "Tipo: detalle"). */
    val TIPOS_ACCION = listOf("Visita", "Llamada", "Entrevista", "Canalización", "Coordinación interinstitucional", "Otra")

    /**
     * Clase del evento: la que manda el servidor o, si es anterior a la Fase 5, la misma
     * regla que el servidor (registro, cambio de estatus o nota).
     */
    fun tipoEvento(historial: List<EventoSeguimiento>, i: Int): String =
        historial[i].tipo ?: when {
            i == 0 -> "registro"
            historial[i].estatus != historial[i - 1].estatus -> "cambio"
            else -> "nota"
        }

    /** true si el evento movió el estatus (las notas, acciones y cambios de expediente no). */
    fun esCambio(tipo: String): Boolean = tipo == "registro" || tipo == "cambio"

    /** Título del evento en la bitácora. */
    fun tituloEvento(tipo: String, estatus: String): String = when (tipo) {
        "registro" -> "Reporte recibido"
        "cambio" -> "Cambio de estatus a \"${CatalogoEstatus.etiqueta(estatus)}\""
        "accion" -> "Acción realizada"
        "expediente" -> "Cambio en el expediente"
        else -> "Nota interna"
    }

    /** Texto que se guarda para una acción: "Visita: se habló con la familia". */
    fun textoAccion(tipo: String, detalle: String): String = "$tipo: ${detalle.trim()}"

    /**
     * ¿Se puede confirmar el cambio de estatus? Cancelar exige motivo; reabrir como
     * Reincidente exige comentario; concluir exige el resultado del caso (Fase 7).
     */
    fun cambioCompleto(destino: String, comentario: String, motivo: String, resultado: String): Boolean = when (destino) {
        "Descartado" -> motivo.isNotBlank()
        CatalogoEstatus.REINCIDENTE -> comentario.isNotBlank()
        "Concluido" -> resultado.isNotBlank()
        else -> true
    }
}
