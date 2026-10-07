package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.Reporte
import mx.sipinna.rieti.network.ServicioRemoto

/** ViewModel de la lista de reportes/casos (CU-09), usada por personal SIPINNA. */
class ReportesListViewModel : ViewModel() {

    private val _reportes = MutableStateFlow<List<Reporte>>(emptyList())
    val reportes: StateFlow<List<Reporte>> = _reportes

    private val _cargando = MutableStateFlow(false)
    val cargando: StateFlow<Boolean> = _cargando

    /** Consulta la lista completa de reportes al backend. */
    fun cargarReportes() {
        _cargando.value = true
        viewModelScope.launch {
            _reportes.value = ServicioRemoto.listarReportes()
            _cargando.value = false
        }
    }
}
