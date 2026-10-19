package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.GeoReversa
import mx.sipinna.rieti.model.Municipio
import mx.sipinna.rieti.model.MunicipioSugerido
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.repository.ReportesRepositorio
import mx.sipinna.rieti.repository.Resultado
import mx.sipinna.rieti.repository.SesionCiudadanoRepositorio

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
 * ViewModel del asistente de reporte anónimo (CU-04; Fases 2 y 5).
 *
 * El estado del asistente ([asistente]) vive **solo en memoria**: sobrevive a la
 * rotación de pantalla porque el ViewModel sobrevive, pero no se escribe en disco
 * ni en el estado guardado de la Activity, así que desaparece con el proceso.
 * No hay borradores.
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

    private val _asistente = MutableStateFlow(EstadoAsistente())

    /** Paso visible, lo capturado y los errores del paso. */
    val asistente: StateFlow<EstadoAsistente> = _asistente.asStateFlow()

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

    private val _municipioPropuesto = MutableStateFlow<MunicipioSugerido?>(null)

    /** Municipio donde cae el punto del mapa cuando no coincide con el elegido (se ofrece cambiarlo). */
    val municipioPropuesto: StateFlow<MunicipioSugerido?> = _municipioPropuesto.asStateFlow()

    private val _buscandoDireccion = MutableStateFlow(false)

    /** true mientras se consulta la dirección del punto. */
    val buscandoDireccion: StateFlow<Boolean> = _buscandoDireccion.asStateFlow()

    private val _avisoGeo = MutableStateFlow<String?>(null)

    /** Mensaje si no se pudo obtener la dirección (el formulario sigue funcionando). */
    val avisoGeo: StateFlow<String?> = _avisoGeo.asStateFlow()

    private var consultaGeo: Job? = null

    private val _fotos = MutableStateFlow<List<ByteArray>>(emptyList())

    /** Fotos opcionales (Fase 8), ya reducidas y sin metadatos; solo en memoria (D-25). */
    val fotos: StateFlow<List<ByteArray>> = _fotos.asStateFlow()

    private val _advertenciaLeida = MutableStateFlow(false)

    /** La persona leyó la advertencia del socio antes de elegir fotos. */
    val advertenciaLeida: StateFlow<Boolean> = _advertenciaLeida.asStateFlow()

    /** Fase 9: registro institucional del personal (sin clave, sin fotos ni vínculo a cuenta). */
    var institucional: Boolean = false

    /** Id del reporte institucional recién registrado (para abrir su detalle). */
    var idInstitucional: Int = 0
        private set

    /** Fotos que se adjuntaron tras crear el reporte (-1 si falló la subida). */
    var fotosAdjuntadas: Int = 0
        private set

    private val _subiendoFotos = MutableStateFlow(false)

    /** true mientras se adjuntan las fotos después de crear el reporte. */
    val subiendoFotos: StateFlow<Boolean> = _subiendoFotos.asStateFlow()

    /** Marca (o desmarca) la advertencia; al desmarcarla se quitan las fotos elegidas. */
    fun leerAdvertencia(leida: Boolean) {
        _advertenciaLeida.value = leida
        if (!leida) _fotos.value = emptyList()
    }

    /** Agrega una foto preparada, sin pasar del máximo. */
    fun agregarFoto(foto: ByteArray) {
        if (_fotos.value.size < ReglasFotos.MAXIMO) _fotos.value = _fotos.value + listOf(foto)
    }

    /** Quita la foto en la posición indicada. */
    fun quitarFoto(i: Int) {
        _fotos.value = _fotos.value.filterIndexed { j, _ -> j != i }
    }

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

    // ---------- Asistente ----------

    /**
     * Cambia lo capturado y quita el error de los campos indicados.
     *
     * @param campos campos que la persona acaba de corregir
     * @param cambio transformación de los datos
     */
    fun actualizar(vararg campos: CampoReporte, cambio: (DatosFormulario) -> DatosFormulario) {
        _asistente.update { AsistenteReporte.limpiarError(it.copy(datos = cambio(it.datos)), *campos) }
    }

    /** Elige el municipio (y descarta la propuesta del mapa). */
    fun elegirMunicipio(m: Municipio?) {
        _municipioPropuesto.value = null
        actualizar(CampoReporte.MUNICIPIO) { it.copy(municipio = m) }
    }

    /** Acepta el municipio donde cae el punto del mapa. */
    fun aceptarMunicipioPropuesto() {
        val propuesto = _municipioPropuesto.value ?: return
        elegirMunicipio((_municipios.value as? UiState.Exito)?.datos?.find { it.id == propuesto.id })
    }

    /**
     * Valida el paso actual y, si todo está bien, pasa al siguiente.
     *
     * @param haySesion true si hay sesión de ciudadano (necesaria para reportar con seguimiento)
     */
    fun avanzar(haySesion: Boolean = SesionCiudadanoRepositorio.haySesion.value) =
        _asistente.update { AsistenteReporte.avanzar(it, _actividades.value, haySesion) }

    /** Regresa un paso; devuelve false si ya estaba en el primero (la pantalla decide si sale). */
    fun retroceder(): Boolean {
        val anterior = AsistenteReporte.retroceder(_asistente.value) ?: return false
        _asistente.value = anterior
        return true
    }

    /** "Editar" desde la revisión: vuelve a un paso ya visitado. */
    fun irA(paso: PasoReporte) = _asistente.update { AsistenteReporte.irA(it, paso) }

    // ---------- Mapa ----------

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
                    aplicarSugerencia(r.datos)
                    if (!r.datos.direccionDisponible) _avisoGeo.value = "No pudimos obtener la dirección. Escríbela a mano."
                }
                is Resultado.Error -> _avisoGeo.value = r.mensaje
            }
            _buscandoDireccion.value = false
        }
    }

    /** Rellena solo lo que la persona no escribió a mano y propone el municipio del punto. */
    private fun aplicarSugerencia(s: GeoReversa) {
        val lista = (_municipios.value as? UiState.Exito)?.datos.orEmpty()
        val sugerido = s.municipioSugerido
        _asistente.update { e ->
            val d = e.datos
            val direccion = ValidadorReporte.aplicarSugerencia(
                d.direccion, d.editados, s.direccion.calle, s.direccion.numeroExterior, s.direccion.colonia, s.direccion.codigoPostal
            )
            val municipio = if (d.municipio == null && sugerido != null) lista.find { it.id == sugerido.id } else d.municipio
            val corregidos = listOfNotNull(
                CampoReporte.CALLE.takeIf { direccion.calle.isNotBlank() },
                CampoReporte.COLONIA.takeIf { direccion.colonia.isNotBlank() },
                CampoReporte.CODIGO_POSTAL.takeIf { direccion.codigoPostal.isNotBlank() },
                CampoReporte.MUNICIPIO.takeIf { municipio != null }
            )
            AsistenteReporte.limpiarError(e.copy(datos = d.copy(direccion = direccion, municipio = municipio)), *corregidos.toTypedArray())
        }
        val elegido = _asistente.value.datos.municipio
        _municipioPropuesto.value = sugerido?.takeIf { elegido != null && it.id != elegido.id }
    }

    // ---------- Envío ----------

    /**
     * Valida todo y envía el reporte con el formato de la Fase 2 (el mismo cuerpo
     * que el formulario de una sola pantalla; ver [AsistenteReporte.solicitud]).
     *
     * @param avisoVersion versión del aviso de privacidad que la persona aceptó
     * @param haySesion true si hay sesión de ciudadano (sin ella, el interruptor no cuenta)
     */
    fun enviar(avisoVersion: String, haySesion: Boolean) {
        if (_envio.value is UiState.Cargando) return
        val estado = _asistente.value
        val pendiente = PasoReporte.entries.firstOrNull {
            it != PasoReporte.REVISAR && AsistenteReporte.problemas(it, estado.datos, _actividades.value, haySesion).isNotEmpty()
        }
        if (pendiente != null) {
            // Puede pasar si la sesión venció en el camino; se lleva a la persona al paso con el problema.
            _asistente.value = AsistenteReporte.avanzar(estado.copy(paso = pendiente), _actividades.value, haySesion)
            return
        }
        val vincular = haySesion && estado.datos.vincular && !institucional
        _envio.value = UiState.Cargando
        val punto = _ubicacion.value
        viewModelScope.launch {
            if (institucional) {
                val r = repositorio.crearInstitucional(AsistenteReporte.solicitud(estado.datos, avisoVersion, punto, false))
                _envio.value = when (r) {
                    is Resultado.Exito -> { idInstitucional = r.datos.id; UiState.Exito(ReporteCreado(r.datos.folio, "", r.datos.estatus, r.datos.fechaCreacion)) }
                    is Resultado.Error -> UiState.Error(r.mensaje, r.codigo)
                }
                return@launch
            }
            val token = if (vincular) SesionCiudadanoRepositorio.tokenVigente() else null
            if (vincular && token == null) {
                _envio.value = UiState.Error("Tu sesión venció. Vuelve a iniciar sesión o envía el reporte sin vincular.")
                return@launch
            }
            val creado = repositorio.crear(AsistenteReporte.solicitud(estado.datos, avisoVersion, punto, vincular), token)
            // Fase 8: con el reporte ya registrado se adjuntan las fotos; si fallan, el reporte sigue registrado.
            if (creado is Resultado.Exito && _fotos.value.isNotEmpty()) {
                _subiendoFotos.value = true
                fotosAdjuntadas = when (val r = repositorio.subirFotos(creado.datos.folio, creado.datos.claveConsulta, _fotos.value)) {
                    is Resultado.Exito -> r.datos
                    is Resultado.Error -> -1
                }
                _subiendoFotos.value = false
                _fotos.value = emptyList()
            }
            _envio.value = creado.aUiState()
        }
    }

    /** Regresa al estado inicial del envío (tras navegar a la confirmación). */
    fun reiniciarEnvio() {
        _envio.value = UiState.Inactivo
    }
}
