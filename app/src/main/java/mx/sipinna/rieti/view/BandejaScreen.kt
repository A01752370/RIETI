package mx.sipinna.rieti.view

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.model.ReporteResumen
import mx.sipinna.rieti.viewmodel.BandejaViewModel
import mx.sipinna.rieti.viewmodel.ESTATUS_CANONICOS
import mx.sipinna.rieti.viewmodel.UiState

/**
 * Bandeja del personal SIPINNA (CU-09): reportes del más reciente al más
 * antiguo, con filtro por estatus.
 *
 * @param alAbrirReporte abre el detalle del reporte
 * @param alCerrarSesion descarta el token y vuelve al inicio
 * @param alSesionExpirada el servidor respondió 401: hay que volver a iniciar sesión
 */
@Composable
fun BandejaScreen(
    alAbrirReporte: (Int) -> Unit,
    alCerrarSesion: () -> Unit,
    alSesionExpirada: () -> Unit,
    viewModel: BandejaViewModel = viewModel()
) {
    val estado by viewModel.reportes.collectAsState()
    val filtro by viewModel.filtro.collectAsState()

    // Se recarga cada vez que se vuelve a la bandeja (p. ej. tras cambiar un estatus).
    LaunchedEffect(Unit) { viewModel.cargar() }
    LaunchedEffect(estado) {
        if ((estado as? UiState.Error)?.codigo == "NO_AUTENTICADO") alSesionExpirada()
    }

    PantallaRieti(
        titulo = "Bandeja de reportes",
        desplazable = false,
        acciones = {
            AccionBarra("Salir") {
                viewModel.cerrarSesion()
                alCerrarSesion()
            }
        }
    ) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                FilterChip(selected = filtro == null, onClick = { viewModel.filtrar(null) }, label = { Text("Todos") })
            }
            items(ESTATUS_CANONICOS) { e ->
                FilterChip(selected = filtro == e, onClick = { viewModel.filtrar(e) }, label = { Text(e) })
            }
        }

        when (val e = estado) {
            is UiState.Inactivo, is UiState.Cargando -> Cargando()
            is UiState.Error -> {
                MensajeError(e.mensaje)
                OutlinedButton(onClick = viewModel::cargar, modifier = Modifier.fillMaxWidth()) { Text("Reintentar") }
            }
            is UiState.Exito -> {
                Text(
                    "${e.datos.total} reporte(s)",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (e.datos.elementos.isEmpty()) {
                    EstadoVacio(if (filtro == null) "Todavía no hay reportes." else "No hay reportes en “$filtro”. Toca “Todos” para ver el resto.")
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(e.datos.elementos, key = { it.id }) { r -> FilaReporte(r) { alAbrirReporte(r.id) } }
                }
            }
        }
    }
}

/** Tarjeta de un reporte en la bandeja. */
@Composable
private fun FilaReporte(r: ReporteResumen, alTocar: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = alTocar)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()) {
                Text(r.folio, style = MaterialTheme.typography.titleSmall)
                EtiquetaEstatus(r.estatus)
            }
            Text(r.municipio ?: "Municipio no indicado", style = MaterialTheme.typography.titleSmall)
            Text(r.ubicacion, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                "${r.actividad} · ${r.cantidadNinos} menor(es) de ${r.edadAproximada} años · Riesgo: ${r.situacionRiesgo}",
                style = MaterialTheme.typography.bodySmall
            )
            Text(formatearFecha(r.fechaCreacion), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
