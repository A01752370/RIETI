package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.model.SeccionAviso
import mx.sipinna.rieti.ui.theme.TextoSecundario
import mx.sipinna.rieti.viewmodel.AvisoPrivacidadViewModel
import mx.sipinna.rieti.viewmodel.UiState

/**
 * Aviso de privacidad (CU-02, RF-44). El texto viene del servidor y la versión
 * aceptada viaja con el reporte como constancia.
 *
 * Formato: secciones con título y párrafos cortos que se desplazan, y la casilla
 * de aceptación con el botón "Continuar" fijos abajo, siempre a la vista.
 *
 * @param alAceptar continúa al formulario con la versión aceptada
 * @param alRegresar vuelve al inicio
 */
@Composable
fun AvisoPrivacidadScreen(
    alAceptar: (String) -> Unit,
    alRegresar: () -> Unit,
    viewModel: AvisoPrivacidadViewModel = viewModel()
) {
    val estado by viewModel.aviso.collectAsState()
    var acepto by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.cargar() }

    val aviso = (estado as? UiState.Exito)?.datos
    PantallaRieti(
        titulo = "Aviso de privacidad",
        alRegresar = alRegresar,
        barraInferior = aviso?.let {
            {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .toggleable(value = acepto, role = Role.Checkbox, onValueChange = { acepto = it })
                    ) {
                        Checkbox(checked = acepto, onCheckedChange = null)
                        Text(
                            "Leí y acepto el aviso de privacidad",
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }
                    Button(
                        onClick = { alAceptar(it.version) },
                        enabled = acepto,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    ) {
                        Text("Continuar")
                    }
                }
            }
        }
    ) {
        when (val e = estado) {
            is UiState.Inactivo, is UiState.Cargando -> Cargando()
            is UiState.Error -> {
                MensajeError(e.mensaje)
                OutlinedButton(onClick = viewModel::cargar, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text("Reintentar")
                }
            }
            is UiState.Exito -> {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Filled.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text(
                        "Antes de reportar, lee cómo cuidamos tu información.",
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
                e.datos.seccionesParaMostrar().forEach { SeccionDelAviso(it) }
                Text(
                    "Versión ${e.datos.version}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoSecundario,
                    modifier = Modifier.padding(top = 8.dp, bottom = 8.dp)
                )
            }
        }
    }
}

/** Una sección del aviso: título (encabezado accesible) y sus párrafos. */
@Composable
private fun SeccionDelAviso(seccion: SeccionAviso) {
    // Sin título (servidor anterior a las secciones) se separan más los párrafos para que no se vean pegados.
    val espacio = if (seccion.titulo.isBlank()) 16.dp else 6.dp
    Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(espacio)) {
        if (seccion.titulo.isNotBlank()) {
            Text(
                seccion.titulo,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.semantics { heading() }
            )
        }
        seccion.parrafos.forEach { Text(it, style = MaterialTheme.typography.bodyLarge) }
    }
}
