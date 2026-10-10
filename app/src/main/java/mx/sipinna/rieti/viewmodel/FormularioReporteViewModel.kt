package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.Municipio
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.repository.ReportesRepositorio

/**
 * Ubicación del lugar de los hechos tomada del GPS.
 *
 * @property latitud latitud en grados
 * @property longitud longitud en grados
 * @property precisionMetros radio de incertidumbre reportado por el GPS, o null
 */
data class UbicacionCapturada(val latitud: Double, val longitud: Double, val precisionMetros: Float?) {
    /** CU-03 A3: con más de 100 m de incertidumbre conviene pedir una referencia más precisa. */
    val esImprecisa: Boolean get() = (precisionMetros ?: 0f) > 100f
}

/**
 * ViewModel del formulario de reporte anónimo (CU-04).
 *
 * La ubicación del GPS solo se usa si la persona lo pide y se envía como
 * ubicación **del lugar de los hechos**; no se guarda en el teléfono (RNF-28).
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

    /** Descarga el catálogo de municipios si aún no se tiene. */
    fun cargarMunicipios() {
        if (_municipios.value is UiState.Exito || _municipios.value is UiState.Cargando) return
        _municipios.value = UiState.Cargando
        viewModelScope.launch { _municipios.value = repositorio.municipios().aUiState() }
    }

    private val _ubicacion = MutableStateFlow<UbicacionCapturada?>(null)

    /** Última lectura del GPS, o null si no se ha pedido. */
    val ubicacion: StateFlow<UbicacionCapturada?> = _ubicacion.asStateFlow()

    /** Llamada por [mx.sipinna.rieti.model.GestorUbicacion] cuando el GPS entrega una lectura. */
    fun actualizarUbicacionCapturada(lat: Double, lng: Double, precisionMetros: Float? = null) {
        _ubicacion.value = UbicacionCapturada(lat, lng, precisionMetros)
    }

    /** Descarta la lectura del GPS (la persona prefirió no enviarla). */
    fun quitarUbicacion() {
        _ubicacion.value = null
    }

    /**
     * Valida y envía el reporte.
     *
     * @param municipio municipio elegido (obligatorio en la app)
     * @param avisoVersion versión del aviso de privacidad que la persona aceptó
     */
    fun enviar(
        municipio: Municipio?,
        ubicacionTexto: String,
        cantidad: String,
        edad: String,
        actividad: String,
        riesgo: String,
        descripcion: String,
        avisoVersion: String
    ) {
        if (_envio.value is UiState.Cargando) return
        val problemas = ValidadorReporte.validar(municipio, ubicacionTexto, cantidad, edad, actividad, riesgo, descripcion)
        if (problemas.isNotEmpty()) {
            _envio.value = UiState.Error(problemas.joinToString("\n"))
            return
        }
        _envio.value = UiState.Cargando
        val gps = _ubicacion.value
        viewModelScope.launch {
            _envio.value = repositorio.crear(
                CrearReporteRequest(
                    municipioId = municipio?.id,
                    ubicacion = ubicacionTexto.trim(),
                    latitud = gps?.latitud,
                    longitud = gps?.longitud,
                    cantidadNinos = ValidadorReporte.CANTIDADES.getValue(cantidad),
                    edadAproximada = edad,
                    actividad = actividad,
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
