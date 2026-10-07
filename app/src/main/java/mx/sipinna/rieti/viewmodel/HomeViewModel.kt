package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.network.ServicioRemoto

/** ViewModel del panel principal de personal SIPINNA. */
class HomeViewModel : ViewModel() {

    private val _totalReportes = MutableStateFlow(0)
    val totalReportes: StateFlow<Int> = _totalReportes

    /** Consulta el total de reportes al backend (`GET /reportes`). */
    fun cargarResumen() {
        viewModelScope.launch {
            _totalReportes.value = ServicioRemoto.listarReportes().size
        }
    }
}
