package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.viewmodel.AvisoPrivacidadViewModel
import mx.sipinna.rieti.viewmodel.UiState

/**
 * Aviso de privacidad (CU-02, RF-44). El texto viene del servidor y la versión
 * aceptada viaja con el reporte como constancia.
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

    PantallaRieti(titulo = "Aviso de privacidad", alRegresar = alRegresar) {
        when (val e = estado) {
            is UiState.Inactivo, is UiState.Cargando -> Cargando()
            is UiState.Error -> {
                MensajeError(e.mensaje)
                OutlinedButton(onClick = viewModel::cargar, modifier = Modifier.fillMaxWidth()) { Text("Reintentar") }
            }
            is UiState.Exito -> {
                e.datos.parrafos.forEach { Text(it, style = MaterialTheme.typography.bodyLarge) }
                Text(
                    "Versión ${e.datos.version}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .toggleable(value = acepto, role = Role.Checkbox, onValueChange = { acepto = it })
                ) {
                    Checkbox(checked = acepto, onCheckedChange = null)
                    Text("Leí y acepto el aviso de privacidad")
                }
                Button(
                    onClick = { alAceptar(e.datos.version) },
                    enabled = acepto,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                ) {
                    Text("Continuar")
                }
            }
        }
    }
}
