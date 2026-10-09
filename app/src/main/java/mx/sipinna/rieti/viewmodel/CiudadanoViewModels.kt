package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.AvisoPrivacidad
import mx.sipinna.rieti.model.ConsultaPublica
import mx.sipinna.rieti.repository.ReportesRepositorio

/**
 * ViewModel del aviso de privacidad (CU-02). Lo descarga del servidor para que
 * la versión aceptada sea siempre la vigente.
 *
 * @param repositorio acceso al API (sustituible en pruebas)
 */
class AvisoPrivacidadViewModel(
    private val repositorio: ReportesRepositorio = ReportesRepositorio()
) : ViewModel() {

    private val _aviso = MutableStateFlow<UiState<AvisoPrivacidad>>(UiState.Inactivo)

    /** Estado de la descarga del aviso. */
    val aviso: StateFlow<UiState<AvisoPrivacidad>> = _aviso.asStateFlow()

    /** Descarga el aviso si aún no se tiene (o si falló antes). */
    fun cargar() {
        if (_aviso.value is UiState.Exito || _aviso.value is UiState.Cargando) return
        _aviso.value = UiState.Cargando
        viewModelScope.launch { _aviso.value = repositorio.avisoPrivacidad().aUiState() }
    }
}

/**
 * ViewModel de la consulta ciudadana con folio + clave (CU-08).
 *
 * @param repositorio acceso al API (sustituible en pruebas)
 */
class ConsultaViewModel(
    private val repositorio: ReportesRepositorio = ReportesRepositorio()
) : ViewModel() {

    private val _consulta = MutableStateFlow<UiState<ConsultaPublica>>(UiState.Inactivo)

    /** Resultado de la última consulta. */
    val consulta: StateFlow<UiState<ConsultaPublica>> = _consulta.asStateFlow()

    /** Valida el formato y consulta el estatus. */
    fun consultar(folioTexto: String, clave: String) {
        if (_consulta.value is UiState.Cargando) return
        val folio = ValidadorReporte.normalizarFolio(folioTexto)
        when {
            folio == null -> _consulta.value = UiState.Error("Escribe el folio completo, por ejemplo RIETI-2026-000123")
            clave.isBlank() -> _consulta.value = UiState.Error("Escribe la clave de consulta que recibiste al reportar")
            else -> {
                _consulta.value = UiState.Cargando
                viewModelScope.launch { _consulta.value = repositorio.consultar(folio, clave).aUiState() }
            }
        }
    }
}
