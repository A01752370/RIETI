package mx.sipinna.rieti.view

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.viewmodel.InicioPersonal
import mx.sipinna.rieti.viewmodel.InicioPersonalViewModel
import mx.sipinna.rieti.viewmodel.UiState

/**
 * Inicio del personal SIPINNA (Fase 3): control rápido, sin gráficas complejas.
 * Tarjetas grandes con lo que hay que atender (pendientes y casos sin cambios
 * en más de una semana) y el conteo por estatus; tocar cualquiera abre la
 * bandeja ya filtrada. Se actualiza deslizando hacia abajo.
 *
 * @param alAbrirBandeja abre la bandeja con filtro de estatus o de "sin atender" (ambos opcionales)
 * @param alAbrirPrioridadAlta abre la bandeja con los pendientes de prioridad Alta (peligro inmediato)
 * @param alAbrirPendientes abre la bandeja con los pendientes (Recibido y En revisión)
 * @param alCerrarSesion descarta el token y vuelve al inicio
 * @param alSesionExpirada el servidor respondió 401: hay que volver a iniciar sesión
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InicioPersonalScreen(
    alAbrirBandeja: (estatus: String?, sinAtender: Int?) -> Unit,
    alAbrirPrioridadAlta: () -> Unit,
    alAbrirPendientes: () -> Unit,
    alCerrarSesion: () -> Unit,
    alSesionExpirada: () -> Unit,
    viewModel: InicioPersonalViewModel = viewModel()
) {
    val estado by viewModel.datos.collectAsState()
    val actualizando by viewModel.actualizando.collectAsState()
    val deslizar = rememberPullToRefreshState()

    // Se recarga cada vez que se vuelve aquí (p. ej. tras cambiar un estatus en la bandeja).
    LaunchedEffect(Unit) { if (estado is UiState.Exito) viewModel.actualizar() else viewModel.cargar() }
    LaunchedEffect(estado) { if ((estado as? UiState.Error)?.codigo == "NO_AUTENTICADO") alSesionExpirada() }
    if (deslizar.isRefreshing) LaunchedEffect(Unit) { viewModel.actualizar() }
    LaunchedEffect(actualizando) { if (!actualizando) deslizar.endRefresh() }

    PantallaRieti(
        titulo = "Inicio del personal",
        desplazable = false,
        acciones = { AccionBarra("Salir") { viewModel.cerrarSesion(); alCerrarSesion() } }
    ) {
        Box(Modifier.fillMaxSize().nestedScroll(deslizar.nestedScrollConnection)) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                when (val e = estado) {
                    is UiState.Inactivo, is UiState.Cargando -> Cargando()
                    is UiState.Error -> {
                        MensajeError(e.mensaje)
                        OutlinedButton(onClick = viewModel::cargar, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Reintentar") }
                    }
                    is UiState.Exito -> Tablero(e.datos, alAbrirBandeja, alAbrirPrioridadAlta, alAbrirPendientes)
                }
            }
            // Solo durante el gesto o la recarga (en reposo el indicador asomaría arriba).
            if (deslizar.progress > 0f || deslizar.isRefreshing) {
                PullToRefreshContainer(state = deslizar, modifier = Modifier.align(Alignment.TopCenter))
            }
        }
    }
}

/** Contenido del inicio con datos. */
@Composable
private fun Tablero(d: InicioPersonal, alAbrirBandeja: (String?, Int?) -> Unit, alAbrirPrioridadAlta: () -> Unit, alAbrirPendientes: () -> Unit) {
    Text("Desliza hacia abajo para actualizar.", style = MaterialTheme.typography.bodySmall)

    // Fase 5: lo más urgente arriba.
    TarjetaAccion(
        icono = Icons.Filled.Warning,
        cifra = d.resumen.prioridadAltaPendientes,
        titulo = "Prioridad alta pendientes",
        detalle = if (d.resumen.prioridadAltaPendientes == 0) "Ninguno por ahora" else "Quien reportó indicó peligro inmediato",
        fondo = if (d.resumen.prioridadAltaPendientes > 0) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant,
        alTocar = alAbrirPrioridadAlta
    )
    TarjetaAccion(
        icono = Icons.Filled.Notifications,
        cifra = d.resumen.pendientes,
        titulo = "Pendientes de atender",
        detalle = "Recibidos y en revisión",
        fondo = MaterialTheme.colorScheme.primaryContainer,
        alTocar = alAbrirPendientes
    )
    TarjetaAccion(
        icono = Icons.Filled.DateRange,
        cifra = d.sinAtender,
        titulo = "Sin cambios en más de ${d.diasSinAtender} días",
        detalle = if (d.sinAtender == 0) "Todo al día" else "Revísalos primero",
        fondo = if (d.sinAtender > 0) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.surfaceVariant,
        alTocar = { alAbrirBandeja(null, d.diasSinAtender) }
    )

    Text("Por estatus", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
    d.resumen.porEstatus.chunked(2).forEach { fila ->
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            fila.forEach { c ->
                TarjetaEstatus(c.etiqueta, c.total, Modifier.weight(1f)) { alAbrirBandeja(c.etiqueta, null) }
            }
            if (fila.size == 1) Box(Modifier.weight(1f))
        }
    }

    Text(
        "${d.resumen.total} reporte(s) en total · ${d.resumen.nuevosUltimos7Dias} en los últimos 7 días",
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.padding(top = 4.dp)
    )
    Button(onClick = { alAbrirBandeja(null, null) }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
        Icon(Icons.AutoMirrored.Filled.List, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
        Text("Ver todos los reportes", modifier = Modifier.padding(start = 8.dp))
    }
}

/** Tarjeta grande con una cifra y su acción. */
@Composable
private fun TarjetaAccion(icono: ImageVector, cifra: Int, titulo: String, detalle: String, fondo: Color, alTocar: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = fondo),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = alTocar)
            .semantics(mergeDescendants = true) { contentDescription = "$titulo: $cifra. $detalle. Toca para ver la lista." }
    ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Icon(icono, contentDescription = null, modifier = Modifier.size(32.dp))
            Column(Modifier.weight(1f)) {
                Text(titulo, style = MaterialTheme.typography.titleMedium)
                Text(detalle, style = MaterialTheme.typography.bodyMedium)
            }
            Text("$cifra", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
        }
    }
}

/** Tarjeta de un estatus: color e icono del estatus, cifra grande. */
@Composable
private fun TarjetaEstatus(estatus: String, total: Int, modifier: Modifier, alTocar: () -> Unit) {
    Card(
        modifier = modifier
            .clickable(role = Role.Button, onClick = alTocar)
            .semantics(mergeDescendants = true) { contentDescription = "$estatus: $total. Toca para ver la lista." }
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            EtiquetaEstatus(estatus)
            Text("$total", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }
    }
}
