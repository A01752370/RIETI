package mx.sipinna.rieti.viewmodel

import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.DireccionReporte
import mx.sipinna.rieti.model.Municipio

/**
 * Pasos del asistente de reporte (Fases 5 y 6), en orden.
 *
 * @property titulo nombre corto del paso (indicador y lectores de pantalla)
 */
enum class PasoReporte(val titulo: String) {
    COMO("Cómo reportar"),
    DONDE("Dónde"),
    QUIENES("A quiénes"),
    QUE("Qué ocurre"),
    REVISAR("Revisar y enviar");

    /** Número del paso para la persona (1 a 5). */
    val numero: Int get() = ordinal + 1

    /** Texto accesible, p. ej. "Paso 3 de 5: A quiénes". */
    val descripcion: String get() = "Paso $numero de ${entries.size}: $titulo"
}

/**
 * Lo capturado en el asistente. Vive **solo en memoria** (en el ViewModel): no
 * se guarda en disco, ni como borrador ni en el estado guardado de la Activity.
 *
 * @property vincular modo de reporte: false = **anónimo** (por defecto), true = **con seguimiento**
 *   (se vincula a la cuenta opcional; Fases 4 y 6)
 * @property municipio municipio elegido, o null
 * @property direccion campos de la dirección
 * @property editados campos de dirección que la persona escribió a mano (el mapa no los sobrescribe)
 * @property peligro respuesta a "¿Está en peligro inmediato?" (Sí, No, No sé)
 * @property cantidad categoría de "¿Cuántas viste?" (1–4, 5+, No sé)
 * @property edades edades aproximadas elegidas (una o varias)
 * @property conteos menores por rango de edad, solo cuando se eligió más de una edad
 * @property actividad actividad elegida
 * @property actividadOtro detalle si la actividad es "Otro"
 * @property riesgo respuesta a "¿Percibes una situación de riesgo?"
 * @property descripcion descripción libre
 */
data class DatosFormulario(
    val vincular: Boolean = false,
    val municipio: Municipio? = null,
    val direccion: DatosDireccion = DatosDireccion(),
    val editados: Set<String> = emptySet(),
    val peligro: String = "",
    val cantidad: String = "",
    val edades: Set<String> = emptySet(),
    val conteos: Map<String, Int> = emptyMap(),
    val actividad: String = "",
    val actividadOtro: String = "",
    val riesgo: String = "",
    val descripcion: String = ""
)

/**
 * Estado del asistente.
 *
 * @property paso paso visible
 * @property datos lo capturado
 * @property errores errores del paso visible, por campo (vacío hasta que la persona intenta avanzar)
 * @property maximo paso más avanzado al que ya llegó (permite "Editar" y volver directo a revisar)
 * @property intentosFallidos cuántas veces se intentó avanzar con datos faltantes (la pantalla sube al resumen de errores)
 */
data class EstadoAsistente(
    val paso: PasoReporte = PasoReporte.COMO,
    val datos: DatosFormulario = DatosFormulario(),
    val errores: Map<CampoReporte, String> = emptyMap(),
    val maximo: PasoReporte = PasoReporte.COMO,
    val intentosFallidos: Int = 0
) {
    /** Fracción completada para la barra de progreso. */
    val progreso: Float get() = paso.numero / PasoReporte.entries.size.toFloat()
}

/**
 * Reglas del asistente de reporte: validación por paso, navegación y armado
 * del cuerpo de `POST /reportes`. Es lógica pura, sin Android, para probarla.
 */
object AsistenteReporte {

    /**
     * Problemas del paso indicado (lista vacía si se puede avanzar).
     *
     * @param haySesion true si hay sesión de ciudadano (el modo "con seguimiento" la necesita)
     */
    fun problemas(paso: PasoReporte, d: DatosFormulario, actividades: List<String>, haySesion: Boolean = false): List<Problema> = when (paso) {
        PasoReporte.COMO ->
            if (d.vincular && !haySesion) {
                listOf(Problema(CampoReporte.MODO, "Inicia sesión o crea tu cuenta para reportar con seguimiento, o elige Anónimo"))
            } else emptyList()
        PasoReporte.DONDE -> ValidadorReporte.problemasDonde(d.municipio, d.direccion)
        PasoReporte.QUIENES -> ValidadorReporte.problemasMenores(d.peligro, d.cantidad, d.edades, d.conteos)
        PasoReporte.QUE -> ValidadorReporte.problemasQue(d.actividad, d.actividadOtro, actividades, d.riesgo, d.descripcion)
        PasoReporte.REVISAR -> PasoReporte.entries.filter { it != PasoReporte.REVISAR }.flatMap { problemas(it, d, actividades, haySesion) }
    }

    /** Primer error de cada campo (el que se muestra junto a él). */
    private fun porCampo(problemas: List<Problema>): Map<CampoReporte, String> =
        problemas.groupBy { it.campo }.mapValues { it.value.first().mensaje }

    /**
     * Intenta pasar al siguiente paso. Si el paso actual tiene problemas, se
     * queda donde está y los marca. Si la persona ya había llegado a revisar
     * (vino a editar), vuelve directo a "Revisar y enviar".
     */
    fun avanzar(e: EstadoAsistente, actividades: List<String>, haySesion: Boolean = false): EstadoAsistente {
        val problemas = problemas(e.paso, e.datos, actividades, haySesion)
        if (problemas.isNotEmpty()) return e.copy(errores = porCampo(problemas), intentosFallidos = e.intentosFallidos + 1)
        if (e.paso == PasoReporte.REVISAR) return e.copy(errores = emptyMap())
        val siguiente = if (e.maximo == PasoReporte.REVISAR) PasoReporte.REVISAR else PasoReporte.entries[e.paso.ordinal + 1]
        return e.copy(paso = siguiente, errores = emptyMap(), maximo = maxOf(e.maximo, siguiente))
    }

    /** Regresa un paso sin perder nada; null si ya está en el primero (la pantalla decide si sale). */
    fun retroceder(e: EstadoAsistente): EstadoAsistente? =
        if (e.paso == PasoReporte.entries.first()) null else e.copy(paso = PasoReporte.entries[e.paso.ordinal - 1], errores = emptyMap())

    /** Salta a un paso ya visitado ("Editar" en la revisión). Los pasos aún no alcanzados no se abren. */
    fun irA(e: EstadoAsistente, paso: PasoReporte): EstadoAsistente =
        if (paso <= e.maximo) e.copy(paso = paso, errores = emptyMap()) else e

    /** Tras corregir un campo, su error desaparece (los demás siguen visibles). */
    fun limpiarError(e: EstadoAsistente, vararg campos: CampoReporte): EstadoAsistente =
        if (campos.none { it in e.errores }) e else e.copy(errores = e.errores - campos.toSet())

    /** true si la persona ya capturó algo (salir pide confirmación). */
    fun hayDatos(d: DatosFormulario): Boolean =
        d.municipio != null || d.direccion != DatosDireccion() || d.conteos.values.any { it > 0 } || d.peligro.isNotEmpty() ||
            d.cantidad.isNotEmpty() || d.edades.isNotEmpty() || d.actividad.isNotEmpty() || d.actividadOtro.isNotBlank() ||
            d.riesgo.isNotEmpty() || d.descripcion.isNotBlank()

    /**
     * Cuerpo de `POST /reportes`. Conserva el formato de la Fase 2 (grupos y dirección) y agrega
     * los campos de la Fase 6: `peligroInmediato`, `cantidad` y `canal = "app"` (con canal, el
     * servidor asigna el folio con clave municipal). La prioridad la calcula el servidor.
     *
     * @param punto lugar de los hechos marcado en el mapa, o null
     * @param vincularCuenta true solo si hay sesión de ciudadano y se eligió "con seguimiento"
     */
    fun solicitud(
        d: DatosFormulario,
        avisoVersion: String,
        punto: UbicacionCapturada?,
        vincularCuenta: Boolean
    ): CrearReporteRequest = CrearReporteRequest(
        municipioId = d.municipio?.id,
        direccion = DireccionReporte(
            calle = d.direccion.calle.trim(),
            numeroExterior = d.direccion.numero.trim().ifEmpty { null },
            colonia = d.direccion.colonia.trim(),
            codigoPostal = d.direccion.codigoPostal.trim(),
            referencias = d.direccion.referencias.trim().ifEmpty { null }
        ),
        latitud = punto?.latitud,
        longitud = punto?.longitud,
        grupos = ValidadorReporte.gruposDesdeFormulario(d.cantidad, d.edades, d.conteos),
        actividad = d.actividad,
        actividadOtro = d.actividadOtro.trim().takeIf { d.actividad == ValidadorReporte.ACTIVIDAD_OTRO && it.isNotEmpty() },
        situacionRiesgo = d.riesgo,
        descripcion = d.descripcion.trim(),
        avisoPrivacidadVersion = avisoVersion,
        vincularCuenta = if (vincularCuenta) true else null,
        peligroInmediato = d.peligro.ifEmpty { null },
        cantidad = d.cantidad.ifEmpty { null },
        canal = CANAL
    )

    /** Canal que declara la app (el servidor solo acepta `app` o `web` de clientes públicos). */
    const val CANAL = "app"
}
