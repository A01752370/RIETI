package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.Reporte
import mx.sipinna.rieti.network.ServicioRemoto

/**
 * ViewModel del formulario de registro de reporte (CU-04).
 *
 * Además del envío al backend, guarda la última ubicación GPS capturada por
 * [mx.sipinna.rieti.model.GestorUbicacion] (`latitud`/`longitud`), para
 * incluirla en la petición y para que la pantalla pueda mostrar el thumbnail
 * del mapa con Coil mientras el usuario completa el resto del formulario.
 */
class FormularioReporteViewModel : ViewModel() {

    private val _enviando = MutableStateFlow(false)
    val enviando: StateFlow<Boolean> = _enviando

    private val _reporteCreado = MutableStateFlow<Reporte?>(null)
    val reporteCreado: StateFlow<Reporte?> = _reporteCreado

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private val _latitud = MutableStateFlow<Double?>(null)
    val latitud: StateFlow<Double?> = _latitud

    private val _longitud = MutableStateFlow<Double?>(null)
    val longitud: StateFlow<Double?> = _longitud

    /** Llamada por [mx.sipinna.rieti.model.GestorUbicacion] cuando el GPS entrega una lectura. */
    fun actualizarUbicacionCapturada(lat: Double, lng: Double) {
        _latitud.value = lat
        _longitud.value = lng
    }

    /**
     * Envía el formulario de reporte al backend, incluyendo la ubicación GPS
     * capturada (si existe) además del texto libre de ubicación.
     */
    fun enviarReporte(
        ubicacion: String,
        descripcion: String,
        cantidadNinos: Int,
        edadAproximada: String,
        actividad: String,
        situacionRiesgo: String
    ) {
        if (ubicacion.isBlank() || descripcion.isBlank()) {
            _error.value = "Completa la ubicación y la descripción"
            return
        }
        _enviando.value = true
        viewModelScope.launch {
            val request = CrearReporteRequest(
                ubicacion = ubicacion,
                latitud = _latitud.value,
                longitud = _longitud.value,
                cantidadNinos = cantidadNinos,
                edadAproximada = edadAproximada,
                actividad = actividad,
                situacionRiesgo = situacionRiesgo,
                descripcion = descripcion
            )
            val resultado = ServicioRemoto.crearReporte(request)
            if (resultado != null) {
                _reporteCreado.value = resultado
                _error.value = null
            } else {
                _error.value = "No se pudo enviar el reporte. Intenta de nuevo."
            }
            _enviando.value = false
        }
    }
}
