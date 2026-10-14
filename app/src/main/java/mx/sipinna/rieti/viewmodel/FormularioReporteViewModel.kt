package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.DireccionReporte
import mx.sipinna.rieti.model.GeoReversa
import mx.sipinna.rieti.model.Municipio
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.repository.ReportesRepositorio
import mx.sipinna.rieti.repository.Resultado

/**
 * Punto del lugar de los hechos (marcador del mapa o lectura del GPS).
 *
 * @property latitud latitud en grados
 * @property longitud longitud en grados
 * @property precisionMetros radio de incertidumbre del GPS, o null si se colocó a mano en el mapa
 */
data class UbicacionCapturada(val latitud: Double, val longitud: Double, val precisionMetros: Float?) {
    /** CU-03 A3: con más de 100 m de incertidumbre conviene pedir una referencia más precisa. */
    val esImprecisa: Boolean get() = (precisionMetros ?: 0f) > 100f
}

/**
 * Sugerencia del servidor para el punto actual del mapa.
 *
 * @property id cambia con cada sugerencia nueva (para que la pantalla la aplique una sola vez)
 * @property datos dirección sugerida y municipio donde cae el punto
 */
data class SugerenciaGeo(val id: Long, val datos: GeoReversa)

/**
 * ViewModel del formulario de reporte anónimo (CU-04, Fase 2).
 *
 * El punto del mapa (o del GPS, si la persona lo pide) es la ubicación **del
 * lugar de los hechos**; no se guarda en el teléfono (RNF-28). La dirección y
 * el municipio sugeridos los calcula el servidor; la app nunca llama directo a
 * terceros.
 *
 * @param repositorio acceso al API (sustituible en pruebas)
 */
class FormularioReporteViewModel(
    private val repositorio: ReportesRepositorio = ReportesRepositorio()
) : ViewModel() {

    private val _envio = MutableStateFlow<UiState<ReporteCreado>>(UiState.Inactivo)

    /** Estado del envío; en [UiState.Exito] la pantalla navega a la confirmación. */
    val envio: StateFlow<UiState<ReporteCreado>> = _envio.asStateFlow()

    private val _municipios = MutableStateFlow<UiState<List<Municipio>>>(UiState.Inactivo)

    /** Catálogo de municipios para el selector (D-16). */
    val municipios: StateFlow<UiState<List<Municipio>>> = _municipios.asStateFlow()

    private val _actividades = MutableStateFlow(ValidadorReporte.ACTIVIDADES_RESPALDO)

    /** Actividades del selector: las del servidor, o las de respaldo si no se pudieron descargar. */
    val actividades: StateFlow<List<String>> = _actividades.asStateFlow()

    private val _ubicacion = MutableStateFlow<UbicacionCapturada?>(null)

    /** Punto del lugar de los hechos, o null si no se ha marcado. */
    val ubicacion: StateFlow<UbicacionCapturada?> = _ubicacion.asStateFlow()

    private val _sugerencia = MutableStateFlow<SugerenciaGeo?>(null)

    /** Última dirección y municipio sugeridos para el punto. */
    val sugerencia: StateFlow<SugerenciaGeo?> = _sugerencia.asStateFlow()

    private val _buscandoDireccion = MutableStateFlow(false)

    /** true mientras se consulta la dirección del punto. */
    val buscandoDireccion: StateFlow<Boolean> = _buscandoDireccion.asStateFlow()

    private val _avisoGeo = MutableStateFlow<String?>(null)

    /** Mensaje si no se pudo obtener la dirección (el formulario sigue funcionando). */
    val avisoGeo: StateFlow<String?> = _avisoGeo.asStateFlow()

    private var consultaGeo: Job? = null
    private var siguienteSugerencia = 1L

    /** Descarga el catálogo de municipios si aún no se tiene. */
    fun cargarMunicipios() {
        if (_municipios.value is UiState.Exito || _municipios.value is UiState.Cargando) return
        _municipios.value = UiState.Cargando
        viewModelScope.launch { _municipios.value = repositorio.municipios().aUiState() }
    }

    /** Descarga el catálogo de actividades; si falla, se queda el de respaldo. */
    fun cargarActividades() {
        viewModelScope.launch {
            val r = repositorio.actividades()
            if (r is Resultado.Exito && r.datos.isNotEmpty()) _actividades.value = r.datos.map { it.nombre }
        }
    }

    /** Llamada por [mx.sipinna.rieti.model.GestorUbicacion] cuando el GPS entrega una lectura. */
    fun actualizarUbicacionCapturada(lat: Double, lng: Double, precisionMetros: Float? = null) {
        _ubicacion.value = UbicacionCapturada(lat, lng, precisionMetros)
        consultarDireccion(lat, lng)
    }

    /** La persona colocó o arrastró el marcador del mapa. */
    fun alMoverMarcador(lat: Double, lng: Double) = actualizarUbicacionCapturada(lat, lng, null)

    /** Descarta el punto (la persona prefirió no enviarlo). */
    fun quitarUbicacion() {
        consultaGeo?.cancel()
        _ubicacion.value = null
        _buscandoDireccion.value = false
    }

    /** Pide al servidor la dirección y el municipio del punto (cancela la consulta anterior). */
    private fun consultarDireccion(lat: Double, lng: Double) {
        consultaGeo?.cancel()
        _buscandoDireccion.value = true
        _avisoGeo.value = null
        consultaGeo = viewModelScope.launch {
            when (val r = repositorio.reversa(lat, lng)) {
                is Resultado.Exito -> {
                    _sugerencia.value = SugerenciaGeo(siguienteSugerencia++, r.datos)
                    if (!r.datos.direccionDisponible) _avisoGeo.value = "No pudimos obtener la dirección. Escríbela a mano."
                }
                is Resultado.Error -> _avisoGeo.value = r.mensaje
            }
            _buscandoDireccion.value = false
        }
    }

    /**
     * Valida y envía el reporte con el formato de la Fase 2.
     *
     * @param municipio municipio elegido (obligatorio en la app)
     * @param direccion campos de la dirección
     * @param conteos menores por rango de edad
     * @param avisoVersion versión del aviso de privacidad que la persona aceptó
     */
    fun enviar(
        municipio: Municipio?,
        direccion: DatosDireccion,
        conteos: Map<String, Int>,
        actividad: String,
        actividadOtro: String,
        riesgo: String,
        descripcion: String,
        avisoVersion: String
    ) {
        if (_envio.value is UiState.Cargando) return
        val problemas = ValidadorReporte.validar(
            municipio, direccion, conteos, actividad, actividadOtro, _actividades.value, riesgo, descripcion
        )
        if (problemas.isNotEmpty()) {
            _envio.value = UiState.Error(problemas.joinToString("\n"))
            return
        }
        _envio.value = UiState.Cargando
        val punto = _ubicacion.value
        viewModelScope.launch {
            _envio.value = repositorio.crear(
                CrearReporteRequest(
                    municipioId = municipio?.id,
                    direccion = DireccionReporte(
                        calle = direccion.calle.trim(),
                        numeroExterior = direccion.numero.trim().ifEmpty { null },
                        colonia = direccion.colonia.trim(),
                        codigoPostal = direccion.codigoPostal.trim(),
                        referencias = direccion.referencias.trim().ifEmpty { null }
                    ),
                    latitud = punto?.latitud,
                    longitud = punto?.longitud,
                    grupos = ValidadorReporte.gruposParaEnviar(conteos),
                    actividad = actividad,
                    actividadOtro = actividadOtro.trim().takeIf { actividad == ValidadorReporte.ACTIVIDAD_OTRO && it.isNotEmpty() },
                    situacionRiesgo = riesgo,
                    descripcion = descripcion.trim(),
                    avisoPrivacidadVersion = avisoVersion
                )
            ).aUiState()
        }
    }

    /** Regresa al estado inicial (tras navegar a la confirmación). */
    fun reiniciarEnvio() {
        _envio.value = UiState.Inactivo
    }
}
