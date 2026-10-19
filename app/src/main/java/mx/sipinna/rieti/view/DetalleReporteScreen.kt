package mx.sipinna.rieti.view

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.core.net.toUri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.Locale
import mx.sipinna.rieti.model.EventoSeguimiento
import mx.sipinna.rieti.model.ReporteDetalle
import mx.sipinna.rieti.ui.theme.Primario
import mx.sipinna.rieti.ui.theme.TextoSecundario
import mx.sipinna.rieti.ui.theme.TintePrimario
import mx.sipinna.rieti.viewmodel.CatalogoEstatus
import mx.sipinna.rieti.viewmodel.ControlExpediente
import mx.sipinna.rieti.viewmodel.DetalleReporteViewModel
import mx.sipinna.rieti.viewmodel.FormatoReporte
import mx.sipinna.rieti.viewmodel.LineaEstatus
import mx.sipinna.rieti.viewmodel.UiState
import mx.sipinna.rieti.viewmodel.ValidadorReporte
import org.osmdroid.util.GeoPoint

/** Largo a partir del cual la descripción se muestra recortada con "Ver todo". */
private const val DESCRIPCION_CORTA = 280

/**
 * Detalle y seguimiento de un reporte (CU-09/CU-10; rediseño de la Fase 5,
 * "control rápido"): una sola columna con el encabezado y las acciones
 * arriba, visibles sin desplazarse; después la línea de progreso, las tarjetas
 * (resumen, ubicación con mini mapa, menores, actividad y riesgo, descripción)
 * y la bitácora como línea de tiempo. Se actualiza deslizando hacia abajo.
 *
 * Las acciones son las transiciones que el servidor marca como válidas (máquina
 * de estados de la Etapa 1); "Descartado" pide motivo y reabrir un caso
 * concluido pide comentario. El personal nunca ve la cuenta ni el correo de
 * quien reportó: el servidor no los envía.
 *
 * @param alRegresar vuelve a la bandeja
 * @param alSesionExpirada el servidor respondió 401: hay que volver a iniciar sesión
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetalleReporteScreen(
    alRegresar: () -> Unit,
    alSesionExpirada: () -> Unit,
    viewModel: DetalleReporteViewModel = viewModel()
) {
    val estado by viewModel.detalle.collectAsState()
    val guardado by viewModel.guardado.collectAsState()
    val actualizando by viewModel.actualizando.collectAsState()
    val deslizar = rememberPullToRefreshState()

    LaunchedEffect(estado, guardado) {
        val codigo = (estado as? UiState.Error)?.codigo ?: (guardado as? UiState.Error)?.codigo
        if (codigo == "NO_AUTENTICADO") alSesionExpirada()
    }
    if (deslizar.isRefreshing) LaunchedEffect(Unit) { viewModel.actualizar() }
    LaunchedEffect(actualizando) { if (!actualizando) deslizar.endRefresh() }

    PantallaRieti(titulo = "Detalle del reporte", alRegresar = alRegresar, desplazable = false) {
        Box(Modifier.fillMaxSize().nestedScroll(deslizar.nestedScrollConnection)) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (val e = estado) {
                    is UiState.Inactivo, is UiState.Cargando -> Cargando()
                    is UiState.Error -> {
                        MensajeError(e.mensaje)
                        OutlinedButton(onClick = viewModel::cargar, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Reintentar") }
                    }
                    is UiState.Exito -> ContenidoDetalle(e.datos, guardado, viewModel)
                }
            }
            if (deslizar.progress > 0f || deslizar.isRefreshing) {
                PullToRefreshContainer(state = deslizar, modifier = Modifier.align(Alignment.TopCenter))
            }
        }
    }
}

/** Detalle con datos: encabezado, acciones, línea de progreso, tarjetas y bitácora. */
@Composable
private fun ContenidoDetalle(r: ReporteDetalle, guardado: UiState<Unit>, viewModel: DetalleReporteViewModel) {
    var accion by remember { mutableStateOf<String?>(null) } // estatus destino o NOTA
    var mensaje by remember { mutableStateOf<String?>(null) }
    val ocupado = guardado is UiState.Cargando

    // Al guardar con éxito se cierra el diálogo y se avisa sin recargar la pantalla.
    var ultimo by remember { mutableStateOf<String?>(null) } // acción rápida del expediente en curso
    LaunchedEffect(guardado) {
        if (guardado is UiState.Exito && (accion != null || ultimo != null)) {
            mensaje = when (accion) {
                null -> ultimo
                NOTA -> "Nota agregada."
                ACCION -> "Acción registrada."
                VERIFICACION -> "Verificación actualizada."
                else -> "Estatus cambiado a \"${CatalogoEstatus.etiqueta(accion!!)}\"."
            }
            accion = null
            ultimo = null
            viewModel.consumirGuardado()
        }
    }

    Encabezado(r, mensaje)
    Acciones(r, enabled = !ocupado) { mensaje = null; viewModel.consumirGuardado(); accion = it }
    if (r.expediente != null) {
        TarjetaExpediente(r, enabled = !ocupado,
            alAsignarme = { mensaje = null; ultimo = "Ahora eres responsable del caso."; viewModel.asignarme() },
            alVerificar = { mensaje = null; viewModel.consumirGuardado(); accion = VERIFICACION })
        if (accion == null && ultimo != null) (guardado as? UiState.Error)?.let { MensajeError(it.mensaje) }
    }

    Tarjeta("Avance") { LineaProgresoEstatus(lineaPersonal(r), mostrarSignificado = false) }
    Tarjeta("Resumen") {
        Dato("Qué", FormatoReporte.actividad(r.actividad, r.actividadOtro))
        Dato("Dónde", listOfNotNull(r.municipio ?: "Municipio no indicado", r.direccion?.colonia?.takeIf { it.isNotBlank() }?.let { "Col. $it" }).joinToString(" · "))
        Dato("Cuándo", "Reportado el ${formatearFecha(r.fechaCreacion)}")
    }
    TarjetaUbicacion(r)
    TarjetaMenores(r)
    Tarjeta("Actividad y riesgo") {
        Dato("Actividad", FormatoReporte.actividad(r.actividad, r.actividadOtro))
        r.peligroInmediato?.let { Dato("¿Peligro inmediato?", it) }
        r.prioridad?.let { Dato("Prioridad", it) }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Dato("¿Riesgo percibido?", r.situacionRiesgo)
            if (r.situacionRiesgo == "Sí") IndicadorRiesgo()
        }
        r.motivoDescarte?.let { Dato("Motivo de cancelación", it) }
    }
    TarjetaDescripcion(r.descripcion)
    Bitacora(r)

    accion?.let { destino ->
        when (destino) {
            ACCION -> DialogoRegistrarAccion(ocupado, (guardado as? UiState.Error)?.mensaje,
                alCancelar = { accion = null; viewModel.consumirGuardado() },
                alConfirmar = { tipo, detalle -> viewModel.registrarAccion(tipo, detalle) })
            VERIFICACION -> DialogoVerificacion(r.expediente?.verificacion ?: "Sin verificar", ocupado, (guardado as? UiState.Error)?.mensaje,
                alCancelar = { accion = null; viewModel.consumirGuardado() },
                alConfirmar = { viewModel.verificar(it) })
            else -> DialogoAccion(
                r = r,
                destino = destino,
                ocupado = ocupado,
                error = (guardado as? UiState.Error)?.mensaje,
                alCancelar = { accion = null; viewModel.consumirGuardado() },
                alConfirmar = { comentario, motivo, resultado ->
                    if (destino == NOTA) viewModel.agregarNota(comentario) else viewModel.cambiarEstatus(destino, comentario, motivo, resultado)
                }
            )
        }
    }
}

/** Marca de la acción "agregar nota" (no es un estatus). */
private const val NOTA = "__nota__"

/** Marca de "registrar acción" (Fase 7). */
private const val ACCION = "__accion__"

/** Marca de "cambiar verificación" (Fase 7). */
private const val VERIFICACION = "__verificacion__"

/** Línea de progreso del personal: solo los cambios de estatus (las notas no avanzan el caso). */
private fun lineaPersonal(r: ReporteDetalle): LineaEstatus {
    val cambios = r.historial.filterIndexed { i, _ -> ControlExpediente.esCambio(tipoEvento(r.historial, i)) || i == 0 }.map { it.estatus to it.fecha }
    return LineaEstatus.calcular(r.estatus, cambios, r.fechaCreacion)
}

/** Clase del evento; si el servidor es anterior a la Fase 5 se calcula con la misma regla que el servidor. */
private fun tipoEvento(historial: List<EventoSeguimiento>, i: Int): String = ControlExpediente.tipoEvento(historial, i)

/** Fecha en que el caso entró a su estatus vigente (del servidor o calculada con la bitácora). */
private fun fechaEstatus(r: ReporteDetalle): String =
    r.fechaEstatusActual ?: r.historial.indices.reversed().firstOrNull { ControlExpediente.esCambio(tipoEvento(r.historial, it)) }
        ?.let { r.historial[it].fecha } ?: r.fechaCreacion

/** Folio con copiar, estatus, riesgo, municipio y tiempos medidos. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Encabezado(r: ReporteDetalle, mensaje: String?) {
    val portapapeles = LocalClipboardManager.current
    var copiado by remember(r.folio) { mutableStateOf(false) }
    Card(colors = CardDefaults.cardColors(containerColor = TintePrimario, contentColor = MaterialTheme.colorScheme.onSurface), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SelectionContainer(Modifier.weight(1f)) {
                    Text(r.folio, style = MaterialTheme.typography.titleLarge, fontFamily = FontFamily.Monospace, modifier = Modifier.semantics { heading() })
                }
                TextButton(
                    onClick = { portapapeles.setText(AnnotatedString(r.folio)); copiado = true },
                    modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = if (copiado) "Folio copiado" else "Copiar folio" }
                ) { Text(if (copiado) "Copiado" else "Copiar") }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                EtiquetaEstatus(r.estatus)
                IndicadorPrioridad(r.prioridad)
                if (r.situacionRiesgo == "Sí") IndicadorRiesgo()
                if (r.expediente?.seguimientoVencido == true) IndicadorTexto("Seguimiento vencido", destacado = true)
                if (r.duplicadoDe != null) IndicadorTexto("Posible duplicado")
            }
            Text(r.municipio ?: "Municipio no indicado", style = MaterialTheme.typography.titleSmall)
            val desdeAlta = FormatoReporte.transcurrido(r.fechaCreacion)
            val enEstatus = FormatoReporte.transcurrido(fechaEstatus(r))
            Text("Alta: ${formatearFecha(r.fechaCreacion)}${desdeAlta?.let { " · hace $it" } ?: ""}", style = MaterialTheme.typography.bodyMedium)
            enEstatus?.let { Text("En \"${CatalogoEstatus.etiqueta(r.estatus)}\" desde hace $it", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold) }
            if (copiado) Text("Folio copiado.", style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
            mensaje?.let {
                Text(it, color = Primario, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            }
        }
    }
}

/** Botones de las transiciones válidas y de "Agregar nota". */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Acciones(r: ReporteDetalle, enabled: Boolean, alElegir: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            if (r.transicionesPermitidas.isEmpty()) "Este caso está en un estatus final y ya no puede cambiar." else "Cambiar estatus a:",
            style = MaterialTheme.typography.labelLarge
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            r.transicionesPermitidas.forEach { destino ->
                OutlinedButton(
                    onClick = { alElegir(destino) },
                    enabled = enabled,
                    border = BorderStroke(1.dp, colorEstatus(destino)),
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Icon(iconoEstatus(destino), contentDescription = null, tint = colorEstatus(destino), modifier = Modifier.size(ButtonDefaults.IconSize))
                    Text(CatalogoEstatus.etiqueta(destino), color = colorEstatus(destino), modifier = Modifier.padding(start = 6.dp))
                }
            }
            OutlinedButton(onClick = { alElegir(NOTA) }, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) {
                Icon(Icons.Filled.Create, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                Text("Agregar nota", modifier = Modifier.padding(start = 6.dp))
            }
            if (r.expediente != null) {
                OutlinedButton(onClick = { alElegir(ACCION) }, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) {
                    Icon(Icons.Filled.Done, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                    Text("Registrar acción", modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
    }
}

/** Diálogo de la acción: comentario (y motivo al descartar), con las reglas de la máquina de estados. */
@Composable
private fun DialogoAccion(
    r: ReporteDetalle,
    destino: String,
    ocupado: Boolean,
    error: String?,
    alCancelar: () -> Unit,
    alConfirmar: (comentario: String, motivo: String, resultado: String) -> Unit
) {
    var comentario by rememberSaveable(destino) { mutableStateOf("") }
    var motivo by rememberSaveable(destino) { mutableStateOf("") }
    var resultado by rememberSaveable(destino) { mutableStateOf("") }
    val esNota = destino == NOTA
    val descartar = destino == "Descartado"
    // Fase 6: marcar un caso como Reincidente exige comentario; Fase 7: concluir exige el resultado.
    val reabrir = destino == CatalogoEstatus.REINCIDENTE
    val concluir = destino == "Concluido"
    val listo = if (esNota) comentario.isNotBlank() else ControlExpediente.cambioCompleto(destino, comentario, motivo, resultado)
    AlertDialog(
        onDismissRequest = { if (!ocupado) alCancelar() },
        title = { Text(if (esNota) "Agregar nota interna" else "Cambiar a \"${CatalogoEstatus.etiqueta(destino)}\"") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!esNota) Text("Estatus actual: ${CatalogoEstatus.etiqueta(r.estatus)}", style = MaterialTheme.typography.bodyMedium)
                if (descartar) {
                    OutlinedTextField(
                        value = motivo, onValueChange = { motivo = it.take(500) },
                        label = { Text("Motivo de la cancelación (obligatorio)") }, modifier = Modifier.fillMaxWidth()
                    )
                }
                if (concluir) {
                    OutlinedTextField(
                        value = resultado, onValueChange = { resultado = it.take(1000) },
                        label = { Text("Resultado del caso (obligatorio)") }, minLines = 2, modifier = Modifier.fillMaxWidth()
                    )
                }
                OutlinedTextField(
                    value = comentario, onValueChange = { comentario = it.take(2000) },
                    label = {
                        Text(when {
                            esNota -> "Nota (solo la ve el personal)"
                            reabrir -> "Comentario: por qué volvió a requerir atención (obligatorio)"
                            else -> "Comentario (opcional)"
                        })
                    },
                    minLines = 3, modifier = Modifier.fillMaxWidth()
                )
                error?.let { MensajeError(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = { alConfirmar(comentario, motivo, resultado) }, enabled = listo && !ocupado, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(if (ocupado) "Guardando…" else if (esNota) "Guardar nota" else "Cambiar")
            }
        },
        dismissButton = {
            TextButton(onClick = alCancelar, enabled = !ocupado, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancelar") }
        }
    )
}

/**
 * Expediente en modo de control rápido (Fase 7): responsable, verificación, seguimiento
 * y dependencia, con "Asignarme" y "Cambiar verificación". La edición completa está en la web.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TarjetaExpediente(r: ReporteDetalle, enabled: Boolean, alAsignarme: () -> Unit, alVerificar: () -> Unit) {
    val e = r.expediente ?: return
    Tarjeta("Expediente") {
        Dato("Responsable", e.responsable?.correo ?: "Sin asignar")
        Dato("Verificación", e.verificacion)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Dato("Próximo seguimiento", e.fechaSeguimiento?.let { formatearFecha(it + "T12:00:00Z") } ?: "Sin fecha")
            if (e.seguimientoVencido) IndicadorTexto("Vencido", destacado = true)
        }
        e.dependencia?.let { Dato("Dependencia", it.nombre) }
        e.resultado?.let { Dato("Resultado", it) }
        r.duplicadoDe?.let { Dato("Posible duplicado de", "${it.folio} (${it.estatusEtiqueta})") }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (e.responsable == null) {
                OutlinedButton(onClick = alAsignarme, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) { Text("Asignarme") }
            }
            OutlinedButton(onClick = alVerificar, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cambiar verificación") }
        }
        Text("Dependencia, fechas y conteos se editan en la web del personal.", style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
    }
}

/** Diálogo "Registrar acción": tipo (visita, llamada…) y qué se hizo. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DialogoRegistrarAccion(ocupado: Boolean, error: String?, alCancelar: () -> Unit, alConfirmar: (tipo: String, detalle: String) -> Unit) {
    var tipo by rememberSaveable { mutableStateOf(ControlExpediente.TIPOS_ACCION.first()) }
    var detalle by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!ocupado) alCancelar() },
        title = { Text("Registrar acción") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Tipo de acción", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    ControlExpediente.TIPOS_ACCION.forEach { t -> FilterChip(selected = tipo == t, onClick = { tipo = t }, label = { Text(t) }) }
                }
                OutlinedTextField(value = detalle, onValueChange = { detalle = it.take(1900) }, label = { Text("Qué se hizo (solo lo ve el personal)") },
                    minLines = 3, modifier = Modifier.fillMaxWidth())
                error?.let { MensajeError(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = { alConfirmar(tipo, detalle) }, enabled = detalle.isNotBlank() && !ocupado, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(if (ocupado) "Guardando…" else "Registrar")
            }
        },
        dismissButton = { TextButton(onClick = alCancelar, enabled = !ocupado, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancelar") } }
    )
}

/** Diálogo para cambiar la verificación del expediente. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DialogoVerificacion(actual: String, ocupado: Boolean, error: String?, alCancelar: () -> Unit, alConfirmar: (String) -> Unit) {
    var elegida by rememberSaveable { mutableStateOf(actual) }
    AlertDialog(
        onDismissRequest = { if (!ocupado) alCancelar() },
        title = { Text("Verificación") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    ControlExpediente.VERIFICACIONES.forEach { v -> FilterChip(selected = elegida == v, onClick = { elegida = v }, label = { Text(v) }) }
                }
                error?.let { MensajeError(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = { alConfirmar(elegida) }, enabled = elegida != actual && !ocupado, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(if (ocupado) "Guardando…" else "Guardar")
            }
        },
        dismissButton = { TextButton(onClick = alCancelar, enabled = !ocupado, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancelar") } }
    )
}

/** Dirección, referencias, mini mapa y botón para abrirlo en el mapa del teléfono. */
@Composable
private fun TarjetaUbicacion(r: ReporteDetalle) {
    val contexto = LocalContext.current
    Tarjeta("Ubicación") {
        val direccion = FormatoReporte.direccion(r.direccion)
        Dato(if (direccion != null) "Dirección" else "Lugar", direccion ?: r.ubicacion)
        r.direccion?.referencias?.takeIf { it.isNotBlank() }?.let { Dato("Referencias", it) }
        if (r.latitud != null && r.longitud != null) {
            MiniMapa(GeoPoint(r.latitud, r.longitud))
            Text(String.format(Locale.US, "%.5f, %.5f", r.latitud, r.longitud), style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
            OutlinedButton(
                onClick = {
                    val geo = String.format(Locale.US, "geo:%.5f,%.5f?q=%.5f,%.5f", r.latitud, r.longitud, r.latitud, r.longitud)
                    try {
                        contexto.startActivity(Intent(Intent.ACTION_VIEW, geo.toUri()))
                    } catch (e: ActivityNotFoundException) {
                        // Sin app de mapas: el punto ya se ve en el mini mapa y en las coordenadas.
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
            ) {
                Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                Text("Abrir en el mapa del teléfono", modifier = Modifier.padding(start = 8.dp))
            }
            Text("Se abrirá en la app de mapas que elijas; esa app recibirá el punto.", style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
        } else {
            Text("El reporte no trae punto en el mapa.", style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
        }
    }
}

/** Menores por grupo de edad con barras proporcionales y el total. */
@Composable
private fun TarjetaMenores(r: ReporteDetalle) {
    val grupos = r.grupos?.takeIf { it.isNotEmpty() } ?: listOf(mx.sipinna.rieti.model.GrupoMenores(r.edadAproximada, r.cantidadNinos))
    val total = grupos.sumOf { it.cantidad }
    Tarjeta("Menores · $total en total") {
        FormatoReporte.proporciones(grupos).forEach { (g, p) ->
            val etiqueta = ValidadorReporte.ETIQUETAS_EDAD[g.rango]?.replace("No estoy seguro/a de la edad", "Edad sin determinar") ?: g.rango
            Column(Modifier.semantics(mergeDescendants = true) { contentDescription = "$etiqueta: ${g.cantidad}" }) {
                Row(Modifier.fillMaxWidth()) {
                    Text(etiqueta, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text("${g.cantidad}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                }
                Box(Modifier.fillMaxWidth().height(10.dp).background(TintePrimario, RoundedCornerShape(5.dp))) {
                    Box(Modifier.fillMaxWidth(p.coerceAtLeast(0.02f)).height(10.dp).background(Primario, RoundedCornerShape(5.dp)))
                }
            }
        }
    }
}

/** Descripción; si es larga se muestra recortada con "Ver todo". */
@Composable
private fun TarjetaDescripcion(texto: String) {
    var completa by rememberSaveable { mutableStateOf(false) }
    val larga = texto.length > DESCRIPCION_CORTA
    Tarjeta("Descripción") {
        SelectionContainer {
            Text(if (larga && !completa) texto.take(DESCRIPCION_CORTA).trimEnd() + "…" else texto, style = MaterialTheme.typography.bodyLarge)
        }
        if (larga) {
            TextButton(onClick = { completa = !completa }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(if (completa) "Ver menos" else "Ver todo")
            }
        }
    }
}

/** Bitácora como línea de tiempo vertical, lo más reciente arriba. */
@Composable
private fun Bitacora(r: ReporteDetalle) {
    Text("Bitácora", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp).semantics { heading() })
    val eventos = r.historial.indices.reversed().toList()
    eventos.forEachIndexed { posicion, i ->
        EventoBitacora(r.historial[i], tipoEvento(r.historial, i), conector = posicion < eventos.lastIndex)
    }
}

/** Un evento: icono según su clase (registro, cambio de estatus o nota), autor, fecha y comentario. */
@Composable
private fun EventoBitacora(ev: EventoSeguimiento, tipo: String, conector: Boolean) {
    val titulo = ControlExpediente.tituloEvento(tipo, ev.estatus)
    val color = when (tipo) {
        "registro" -> colorEstatus("Recibido")
        "cambio" -> colorEstatus(ev.estatus)
        "accion" -> Primario
        else -> TextoSecundario
    }
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(36.dp).fillMaxHeight()) {
            Surface(color = color, shape = CircleShape, modifier = Modifier.size(32.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        when (tipo) { "nota" -> Icons.Filled.Create; "accion" -> Icons.Filled.Done; "expediente" -> Icons.Filled.Edit; else -> iconoEstatus(ev.estatus) },
                        contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp)
                    )
                }
            }
            if (conector) Box(Modifier.width(2.dp).weight(1f).background(TintePrimario))
        }
        Column(Modifier.weight(1f).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(titulo, style = MaterialTheme.typography.titleSmall)
            Text("${formatearFecha(ev.fecha)} · ${ev.autor ?: "Registro automático"}", style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
            ev.comentario?.takeIf { it.isNotBlank() }?.let {
                SelectionContainer { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp)) }
            }
        }
    }
}

/** Tarjeta con título de sección. */
@Composable
private fun Tarjeta(titulo: String, contenido: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(titulo, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            contenido()
        }
    }
}

/** Etiqueta y valor. */
@Composable
private fun Dato(etiqueta: String, valor: String) {
    Column(Modifier.semantics(mergeDescendants = true) {}) {
        Text(etiqueta, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(valor, style = MaterialTheme.typography.bodyLarge)
    }
}
