package mx.sipinna.rieti.viewmodel

import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.DireccionReporte
import mx.sipinna.rieti.model.Municipio

/**
 * Pasos del asistente de reporte (Fase 5), en orden.
 *
 * @property titulo nombre corto del paso (indicador y lectores de pantalla)
 */
enum class PasoReporte(val titulo: String) {
    DONDE("Dónde"),
    QUIENES("A quiénes"),
    QUE("Qué ocurre"),
    REVISAR("Revisar y enviar");

    /** Número del paso para la persona (1 a 4). */
    val numero: Int get() = ordinal + 1

    /** Texto accesible, p. ej. "Paso 2 de 4: A quiénes". */
    val descripcion: String get() = "Paso $numero de ${entries.size}: $titulo"
}

/**
 * Lo capturado en el asistente. Vive **solo en memoria** (en el ViewModel): no
 * se guarda en disco, ni como borrador ni en el estado guardado de la Activity.
 *
 * @property municipio municipio elegido, o null
 * @property direccion campos de la dirección
 * @property editados campos de dirección que la persona escribió a mano (el mapa no los sobrescribe)
 * @property conteos menores por rango de edad
 * @property actividad actividad elegida
 * @property actividadOtro detalle si la actividad es "Otro"
 * @property riesgo respuesta a "¿Percibes una situación de riesgo?"
 * @property descripcion descripción libre
 * @property vincular interruptor "Vincular este reporte a mi cuenta" (apagado por defecto, Fase 4)
 */
data class DatosFormulario(
    val municipio: Municipio? = null,
    val direccion: DatosDireccion = DatosDireccion(),
    val editados: Set<String> = emptySet(),
    val conteos: Map<String, Int> = emptyMap(),
    val actividad: String = "",
    val actividadOtro: String = "",
    val riesgo: String = "",
    val descripcion: String = "",
    val vincular: Boolean = false
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
    val paso: PasoReporte = PasoReporte.DONDE,
    val datos: DatosFormulario = DatosFormulario(),
    val errores: Map<CampoReporte, String> = emptyMap(),
    val maximo: PasoReporte = PasoReporte.DONDE,
    val intentosFallidos: Int = 0
) {
    /** Fracción completada para la barra de progreso (0.25 en el paso 1, 1.0 en el último). */
    val progreso: Float get() = paso.numero / PasoReporte.entries.size.toFloat()
}

/**
 * Reglas del asistente de reporte: validación por paso, navegación y armado
 * del cuerpo de `POST /reportes`. Es lógica pura, sin Android, para probarla.
 */
object AsistenteReporte {

    /**
     * Problemas del paso indicado (lista vacía si se puede avanzar).
     * Los mensajes son los de [ValidadorReporte].
     */
    fun problemas(paso: PasoReporte, d: DatosFormulario, actividades: List<String>): List<Problema> = when (paso) {
        PasoReporte.DONDE -> ValidadorReporte.problemasDonde(d.municipio, d.direccion)
        PasoReporte.QUIENES -> ValidadorReporte.problemasQuienes(d.conteos)
        PasoReporte.QUE -> ValidadorReporte.problemasQue(d.actividad, d.actividadOtro, actividades, d.riesgo, d.descripcion)
        PasoReporte.REVISAR -> PasoReporte.entries.filter { it != PasoReporte.REVISAR }.flatMap { problemas(it, d, actividades) }
    }

    /** Primer error de cada campo (el que se muestra junto a él). */
    private fun porCampo(problemas: List<Problema>): Map<CampoReporte, String> =
        problemas.groupBy { it.campo }.mapValues { it.value.first().mensaje }

    /**
     * Intenta pasar al siguiente paso. Si el paso actual tiene problemas, se
     * queda donde está y los marca. Si la persona ya había llegado a revisar
     * (vino a editar), vuelve directo a "Revisar y enviar".
     */
    fun avanzar(e: EstadoAsistente, actividades: List<String>): EstadoAsistente {
        val problemas = problemas(e.paso, e.datos, actividades)
        if (problemas.isNotEmpty()) return e.copy(errores = porCampo(problemas), intentosFallidos = e.intentosFallidos + 1)
        if (e.paso == PasoReporte.REVISAR) return e.copy(errores = emptyMap())
        val siguiente = if (e.maximo == PasoReporte.REVISAR) PasoReporte.REVISAR else PasoReporte.entries[e.paso.ordinal + 1]
        return e.copy(paso = siguiente, errores = emptyMap(), maximo = maxOf(e.maximo, siguiente))
    }

    /** Regresa un paso sin perder nada; null si ya está en el primero (la pantalla decide si sale). */
    fun retroceder(e: EstadoAsistente): EstadoAsistente? =
        if (e.paso == PasoReporte.DONDE) null else e.copy(paso = PasoReporte.entries[e.paso.ordinal - 1], errores = emptyMap())

    /** Salta a un paso ya visitado ("Editar" en la revisión). Los pasos aún no alcanzados no se abren. */
    fun irA(e: EstadoAsistente, paso: PasoReporte): EstadoAsistente =
        if (paso <= e.maximo) e.copy(paso = paso, errores = emptyMap()) else e

    /** Tras corregir un campo, su error desaparece (los demás siguen visibles). */
    fun limpiarError(e: EstadoAsistente, vararg campos: CampoReporte): EstadoAsistente =
        if (campos.none { it in e.errores }) e else e.copy(errores = e.errores - campos.toSet())

    /** true si la persona ya capturó algo (salir pide confirmación). */
    fun hayDatos(d: DatosFormulario): Boolean =
        d.municipio != null || d.direccion != DatosDireccion() || d.conteos.values.any { it > 0 } ||
            d.actividad.isNotEmpty() || d.actividadOtro.isNotBlank() || d.riesgo.isNotEmpty() || d.descripcion.isNotBlank()

    /**
     * Cuerpo de `POST /reportes`: **idéntico** al que enviaba el formulario de una
     * sola pantalla (mismo recorte de espacios, mismos opcionales en null y
     * `vincularCuenta` solo cuando la persona lo activó con sesión).
     *
     * @param punto lugar de los hechos marcado en el mapa, o null
     * @param vincularCuenta true solo si hay sesión de ciudadano y el interruptor está encendido
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
        grupos = ValidadorReporte.gruposParaEnviar(d.conteos),
        actividad = d.actividad,
        actividadOtro = d.actividadOtro.trim().takeIf { d.actividad == ValidadorReporte.ACTIVIDAD_OTRO && it.isNotEmpty() },
        situacionRiesgo = d.riesgo,
        descripcion = d.descripcion.trim(),
        avisoPrivacidadVersion = avisoVersion,
        vincularCuenta = if (vincularCuenta) true else null
    )
}
