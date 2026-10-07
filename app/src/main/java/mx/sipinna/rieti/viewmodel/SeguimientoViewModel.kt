package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.ActualizarReporteRequest
import mx.sipinna.rieti.model.Reporte
import mx.sipinna.rieti.network.ServicioRemoto

/**
 * ViewModel de seguimiento de un caso por folio (CU-08 ciudadano / CU-09-10 personal SIPINNA).
 *
 * El mapa de ubicación (Coil) que muestra la pantalla usa `caso.value?.latitud`
 * y `longitud`, que vienen directo del backend si el reporte se creó con GPS.
 */
class SeguimientoViewModel : ViewModel() {

    private val _caso = MutableStateFlow<Reporte?>(null)
    val caso: StateFlow<Reporte?> = _caso

    private val _guardando = MutableStateFlow(false)
    val guardando: StateFlow<Boolean> = _guardando

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    /** Busca un caso por su folio público (`GET /reportes/folio/{folio}`). */
    fun buscarPorFolio(folio: String) {
        if (folio.isBlank()) {
            _error.value = "Ingresa un folio"
            return
        }
        viewModelScope.launch {
            val resultado = ServicioRemoto.buscarPorFolio(folio.trim())
            if (resultado != null) {
                _caso.value = resultado
                _error.value = null
            } else {
                _error.value = "No se encontró ningún caso con ese folio"
            }
        }
    }

    /** Actualiza el estatus y agrega un comentario de seguimiento al caso actual. */
    fun actualizar(idCaso: Int, nuevoEstatus: String, comentario: String) {
        _guardando.value = true
        viewModelScope.launch {
            val resultado = ServicioRemoto.actualizarReporte(
                idCaso,
                ActualizarReporteRequest(nuevoEstatus, comentario)
            )
            if (resultado != null) {
                _caso.value = resultado
                _error.value = null
            } else {
                _error.value = "No se pudo guardar la actualización"
            }
            _guardando.value = false
        }
    }
}
