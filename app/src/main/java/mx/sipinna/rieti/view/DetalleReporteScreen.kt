package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.Locale
import mx.sipinna.rieti.model.ReporteDetalle
import mx.sipinna.rieti.viewmodel.DetalleReporteViewModel
import mx.sipinna.rieti.viewmodel.UiState

/**
 * Detalle y seguimiento de un reporte (CU-09/CU-10): datos del reporte,
 * bitácora, cambio de estatus y notas.
 *
 * Las opciones de estatus son las que el servidor marca como válidas según la
 * máquina de estados de la Etapa 1; "Descartado" pide motivo.
 *
 * @param alRegresar vuelve a la bandeja
 * @param alSesionExpirada el servidor respondió 401: hay que volver a iniciar sesión
 */
@Composable
fun DetalleReporteScreen(
    alRegresar: () -> Unit,
    alSesionExpirada: () -> Unit,
    viewModel: DetalleReporteViewModel = viewModel()
) {
    val estado by viewModel.detalle.collectAsState()
    val guardado by viewModel.guardado.collectAsState()

    LaunchedEffect(estado, guardado) {
        val codigo = (estado as? UiState.Error)?.codigo ?: (guardado as? UiState.Error)?.codigo
        if (codigo == "NO_AUTENTICADO") alSesionExpirada()
    }

    PantallaRieti(titulo = "Detalle del reporte", alRegresar = alRegresar) {
        when (val e = estado) {
            is UiState.Inactivo, is UiState.Cargando -> Cargando()
            is UiState.Error -> {
                MensajeError(e.mensaje)
                OutlinedButton(onClick = viewModel::cargar, modifier = Modifier.fillMaxWidth()) { Text("Reintentar") }
            }
            is UiState.Exito -> {
                DatosReporte(e.datos)
                Seguimiento(e.datos, guardado, viewModel)
                Bitacora(e.datos)
            }
        }
    }
}

/** Datos capturados por el ciudadano. */
@Composable
private fun DatosReporte(r: ReporteDetalle) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()) {
                Text(r.folio, style = MaterialTheme.typography.titleMedium)
                EtiquetaEstatus(r.estatus)
            }
            Campo("Registrado", formatearFecha(r.fechaCreacion))
            Campo("Lugar", r.ubicacion)
            if (r.latitud != null && r.longitud != null) {
                Campo("Coordenadas", String.format(Locale.US, "%.5f, %.5f", r.latitud, r.longitud))
            }
            Campo("Actividad", r.actividad)
            Campo("Menores", "${r.cantidadNinos} de ${r.edadAproximada} años")
            Campo("¿Riesgo percibido?", r.situacionRiesgo)
            Campo("Descripción", r.descripcion)
            r.motivoDescarte?.let { Campo("Motivo de descarte", it) }
        }
    }
}

/** Etiqueta y valor. */
@Composable
private fun Campo(etiqueta: String, valor: String) {
    Column {
        Text(etiqueta, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(valor, style = MaterialTheme.typography.bodyLarge)
    }
}

/** Cambio de estatus y notas. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Seguimiento(r: ReporteDetalle, guardado: UiState<Unit>, viewModel: DetalleReporteViewModel) {
    var nuevoEstatus by rememberSaveable(r.estatus) { mutableStateOf<String?>(null) }
    var comentario by rememberSaveable(r.estatus, r.historial.size) { mutableStateOf("") }
    var motivo by rememberSaveable(r.estatus) { mutableStateOf("") }
    val ocupado = guardado is UiState.Cargando

    Text("Seguimiento", style = MaterialTheme.typography.titleMedium)
    if (r.transicionesPermitidas.isEmpty()) {
        Text("Este caso está en un estatus final y ya no puede cambiar.", style = MaterialTheme.typography.bodyMedium)
    } else {
        Text("Cambiar estatus a:", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            r.transicionesPermitidas.forEach { e ->
                FilterChip(
                    selected = nuevoEstatus == e,
                    onClick = { nuevoEstatus = if (nuevoEstatus == e) null else e },
                    label = { Text(e) },
                    modifier = Modifier.heightIn(min = 48.dp)
                )
            }
        }
    }
    if (nuevoEstatus == "Descartado") {
        OutlinedTextField(
            value = motivo,
            onValueChange = { motivo = it.take(500) },
            label = { Text("Motivo del descarte (obligatorio)") },
            modifier = Modifier.fillMaxWidth()
        )
    }
    OutlinedTextField(
        value = comentario,
        onValueChange = { comentario = it.take(2000) },
        label = { Text(if (nuevoEstatus == null) "Nota de seguimiento" else "Comentario del cambio (opcional)") },
        minLines = 2,
        modifier = Modifier.fillMaxWidth()
    )

    when (guardado) {
        is UiState.Error -> MensajeError(guardado.mensaje)
        is UiState.Exito -> Text("Guardado.", color = MaterialTheme.colorScheme.primary)
        else -> Unit
    }

    val destino = nuevoEstatus
    Button(
        onClick = {
            if (destino != null) viewModel.cambiarEstatus(destino, comentario, motivo) else viewModel.agregarNota(comentario)
        },
        enabled = !ocupado && (destino != null || comentario.isNotBlank()),
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
    ) {
        Text(
            when {
                ocupado -> "Guardando…"
                destino != null -> "Cambiar a \"$destino\""
                else -> "Agregar nota"
            }
        )
    }
}

/** Bitácora del caso, del evento más reciente al más antiguo. */
@Composable
private fun Bitacora(r: ReporteDetalle) {
    Text("Bitácora", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
    r.historial.asReversed().forEach { ev ->
        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EtiquetaEstatus(ev.estatus)
                Text(formatearFecha(ev.fecha), style = MaterialTheme.typography.bodySmall)
            }
            ev.comentario?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp)) }
            Text(
                ev.autor ?: "Registro automático",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        HorizontalDivider()
    }
}
