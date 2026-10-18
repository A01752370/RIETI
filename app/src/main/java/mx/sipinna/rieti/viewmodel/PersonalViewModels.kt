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
import mx.sipinna.rieti.model.ResumenPersonal
import mx.sipinna.rieti.repository.ReportesRepositorio
import mx.sipinna.rieti.repository.Resultado
import mx.sipinna.rieti.repository.SesionRepositorio

/** Estatus canónicos (nombres internos; Etapa 1, D-11 y Fase 6), en el orden de los filtros de la bandeja. */
val ESTATUS_CANONICOS = CatalogoEstatus.TODOS

/**
 * ViewModel de la bandeja del personal (CU-09).
 *
 * @param repositorio acceso al API (sustituible en pruebas)
 * @param sesion repositorio de sesión, para cerrar sesión
 */
class BandejaViewModel @JvmOverloads constructor(
    estado: SavedStateHandle = SavedStateHandle(),
    private val repositorio: ReportesRepositorio = ReportesRepositorio(),
    private val sesion: SesionRepositorio = SesionRepositorio()
) : ViewModel() {

    private val _reportes = MutableStateFlow<UiState<Pagina<ReporteResumen>>>(UiState.Inactivo)

    /** Estado de la lista de reportes. */
    val reportes: StateFlow<UiState<Pagina<ReporteResumen>>> = _reportes.asStateFlow()

    private val _filtro = MutableStateFlow(estado.get<String>("estatus")?.takeIf { it in ESTATUS_CANONICOS })

    /** Estatus por el que se filtra, o null para ver todos. */
    val filtro: StateFlow<String?> = _filtro.asStateFlow()

    private val _sinAtenderDias = MutableStateFlow(estado.get<Int>("sinAtender")?.takeIf { it > 0 })

    /** Si no es null, solo se muestran pendientes sin cambios en más de esos días (enlace del inicio). */
    val sinAtenderDias: StateFlow<Int?> = _sinAtenderDias.asStateFlow()

    private val _prioridadAlta = MutableStateFlow(estado.get<Boolean>("prioridadAlta") == true)

    /** true: solo pendientes con prioridad Alta, es decir, con peligro inmediato (enlace del inicio, Fase 6). */
    val prioridadAlta: StateFlow<Boolean> = _prioridadAlta.asStateFlow()

    private val _pendientes = MutableStateFlow(estado.get<Boolean>("pendientes") == true)

    /** true: solo casos pendientes de atender, Recibido o En revisión (enlace del inicio, Fase 5). */
    val pendientes: StateFlow<Boolean> = _pendientes.asStateFlow()

    /** Cambia el filtro de estatus (quita los filtros que vienen del inicio) y recarga. */
    fun filtrar(estatus: String?) {
        _filtro.value = estatus
        _sinAtenderDias.value = null
        _prioridadAlta.value = false
        _pendientes.value = false
        cargar()
    }

    /** (Re)carga la primera página con los filtros actuales. */
    fun cargar() {
        _reportes.value = UiState.Cargando
        val estatus = _filtro.value
        val dias = _sinAtenderDias.value
        val riesgo = _prioridadAlta.value
        // "Prioridad alta" en el inicio siempre se refiere a casos pendientes de atender.
        val soloPendientes = _pendientes.value || riesgo
        viewModelScope.launch {
            _reportes.value = repositorio.listarFiltrado(estatus, dias, riesgo, soloPendientes).aUiState()
        }
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

    private val _actualizando = MutableStateFlow(false)

    /** true mientras se recarga con el gesto de deslizar (el detalle anterior sigue a la vista). */
    val actualizando: StateFlow<Boolean> = _actualizando.asStateFlow()

    /** Descarga el detalle (con indicador de carga a pantalla completa). */
    fun cargar() {
        _detalle.value = UiState.Cargando
        viewModelScope.launch { _detalle.value = repositorio.detalle(id).aUiState() }
    }

    /** Recarga sin ocultar el detalle actual (deslizar hacia abajo). */
    fun actualizar() {
        if (_actualizando.value) return
        _actualizando.value = true
        viewModelScope.launch {
            val r = repositorio.detalle(id).aUiState()
            if (r is UiState.Exito || _detalle.value !is UiState.Exito) _detalle.value = r
            _actualizando.value = false
        }
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

/** Datos del inicio del personal: resumen agregado y casos sin atender. */
data class InicioPersonal(val resumen: ResumenPersonal, val sinAtender: Int, val diasSinAtender: Int)

/**
 * ViewModel del inicio del personal (Fase 3): conteos por estatus, pendientes y
 * casos sin atender, con recarga manual (deslizar hacia abajo).
 *
 * @param repositorio acceso al API (sustituible en pruebas)
 * @param sesion repositorio de sesión, para cerrar sesión
 */
class InicioPersonalViewModel(
    private val repositorio: ReportesRepositorio = ReportesRepositorio(),
    private val sesion: SesionRepositorio = SesionRepositorio()
) : ViewModel() {

    /** Antigüedad (días) a partir de la cual un caso pendiente se considera sin atender. */
    val diasSinAtender = 7

    private val _datos = MutableStateFlow<UiState<InicioPersonal>>(UiState.Inactivo)

    /** Estado de los datos del inicio. */
    val datos: StateFlow<UiState<InicioPersonal>> = _datos.asStateFlow()

    private val _actualizando = MutableStateFlow(false)

    /** true mientras se recarga con el gesto de deslizar (los datos anteriores siguen a la vista). */
    val actualizando: StateFlow<Boolean> = _actualizando.asStateFlow()

    /** Carga por primera vez (con indicador de carga a pantalla completa). */
    fun cargar() {
        if (_datos.value is UiState.Cargando) return
        _datos.value = UiState.Cargando
        viewModelScope.launch { _datos.value = consultar() }
    }

    /** Recarga sin ocultar los datos actuales. */
    fun actualizar() {
        if (_actualizando.value) return
        _actualizando.value = true
        viewModelScope.launch {
            val r = consultar()
            if (r is UiState.Exito || _datos.value !is UiState.Exito) _datos.value = r
            _actualizando.value = false
        }
    }

    private suspend fun consultar(): UiState<InicioPersonal> {
        val resumen = repositorio.resumen()
        if (resumen is Resultado.Error) return resumen.aUiState()
        val sinAtender = (repositorio.sinAtender(diasSinAtender) as? Resultado.Exito)?.datos?.total ?: 0
        return UiState.Exito(InicioPersonal((resumen as Resultado.Exito).datos, sinAtender, diasSinAtender))
    }

    /** Descarta el token en memoria. */
    fun cerrarSesion() = sesion.cerrarSesion()
}
