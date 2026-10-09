package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.Pagina
import mx.sipinna.rieti.model.ReporteDetalle
import mx.sipinna.rieti.model.ReporteResumen
import mx.sipinna.rieti.repository.ReportesRepositorio
import mx.sipinna.rieti.repository.Resultado
import mx.sipinna.rieti.repository.SesionRepositorio

/** Estatus canónicos (Etapa 1, D-11), en el orden de los filtros de la bandeja. */
val ESTATUS_CANONICOS = listOf("Recibido", "En revisión", "En atención", "Canalizado", "Concluido", "Descartado")

/**
 * ViewModel de la bandeja del personal (CU-09).
 *
 * @param repositorio acceso al API (sustituible en pruebas)
 * @param sesion repositorio de sesión, para cerrar sesión
 */
class BandejaViewModel(
    private val repositorio: ReportesRepositorio = ReportesRepositorio(),
    private val sesion: SesionRepositorio = SesionRepositorio()
) : ViewModel() {

    private val _reportes = MutableStateFlow<UiState<Pagina<ReporteResumen>>>(UiState.Inactivo)

    /** Estado de la lista de reportes. */
    val reportes: StateFlow<UiState<Pagina<ReporteResumen>>> = _reportes.asStateFlow()

    private val _filtro = MutableStateFlow<String?>(null)

    /** Estatus por el que se filtra, o null para ver todos. */
    val filtro: StateFlow<String?> = _filtro.asStateFlow()

    /** Cambia el filtro y recarga. */
    fun filtrar(estatus: String?) {
        _filtro.value = estatus
        cargar()
    }

    /** (Re)carga la primera página con el filtro actual. */
    fun cargar() {
        _reportes.value = UiState.Cargando
        val estatus = _filtro.value
        viewModelScope.launch { _reportes.value = repositorio.listar(estatus).aUiState() }
    }

    /** Descarta el token en memoria. */
    fun cerrarSesion() = sesion.cerrarSesion()
}

/**
 * ViewModel del detalle y seguimiento de un reporte (CU-09/CU-10).
 *
 * Las opciones de cambio de estatus vienen del servidor
 * ([ReporteDetalle.transicionesPermitidas]); la app no decide qué transición es válida.
 *
 * @param estado argumentos de navegación (`id` del reporte)
 * @param repositorio acceso al API (sustituible en pruebas)
 */
class DetalleReporteViewModel @JvmOverloads constructor(
    estado: SavedStateHandle,
    private val repositorio: ReportesRepositorio = ReportesRepositorio()
) : ViewModel() {

    private val id: Int = checkNotNull(estado.get<Int>("id")) { "Falta el id del reporte" }

    private val _detalle = MutableStateFlow<UiState<ReporteDetalle>>(UiState.Inactivo)

    /** Estado del detalle. */
    val detalle: StateFlow<UiState<ReporteDetalle>> = _detalle.asStateFlow()

    private val _guardado = MutableStateFlow<UiState<Unit>>(UiState.Inactivo)

    /** Estado de la última acción de guardado (cambio de estatus o nota). */
    val guardado: StateFlow<UiState<Unit>> = _guardado.asStateFlow()

    init {
        cargar()
    }

    /** Descarga el detalle. */
    fun cargar() {
        _detalle.value = UiState.Cargando
        viewModelScope.launch { _detalle.value = repositorio.detalle(id).aUiState() }
    }

    /**
     * Cambia el estatus. Si es "Descartado", [motivo] es obligatorio.
     *
     * @param estatus estatus destino (uno de los permitidos)
     * @param comentario nota que acompaña al cambio
     * @param motivo motivo de descarte
     */
    fun cambiarEstatus(estatus: String, comentario: String, motivo: String) {
        if (estatus == "Descartado" && motivo.isBlank()) {
            _guardado.value = UiState.Error("Para descartar escribe el motivo")
            return
        }
        guardar { repositorio.cambiarEstatus(id, estatus, comentario, motivo) }
    }

    /** Agrega una nota sin cambiar el estatus. */
    fun agregarNota(comentario: String) {
        if (comentario.isBlank()) {
            _guardado.value = UiState.Error("Escribe la nota antes de guardarla")
            return
        }
        guardar { repositorio.agregarSeguimiento(id, comentario.trim()) }
    }

    /** Limpia el mensaje de la última acción. */
    fun consumirGuardado() {
        _guardado.value = UiState.Inactivo
    }

    private fun guardar(accion: suspend () -> Resultado<ReporteDetalle>) {
        if (_guardado.value is UiState.Cargando) return
        _guardado.value = UiState.Cargando
        viewModelScope.launch {
            when (val r = accion()) {
                is Resultado.Exito -> {
                    _detalle.value = UiState.Exito(r.datos)
                    _guardado.value = UiState.Exito(Unit)
                }
                is Resultado.Error -> _guardado.value = UiState.Error(r.mensaje, r.codigo)
            }
        }
    }
}
