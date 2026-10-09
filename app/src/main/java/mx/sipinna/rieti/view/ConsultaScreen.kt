package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.viewmodel.ConsultaViewModel
import mx.sipinna.rieti.viewmodel.UiState

/**
 * Consulta del estado de un reporte con folio + clave (CU-08, RF-38, RF-47).
 * Solo muestra estatus y fechas; nunca la descripción ni notas del personal.
 *
 * @param alRegresar vuelve al inicio
 */
@Composable
fun ConsultaScreen(alRegresar: () -> Unit, viewModel: ConsultaViewModel = viewModel()) {
    var folio by rememberSaveable { mutableStateOf("") }
    var clave by rememberSaveable { mutableStateOf("") }
    val estado by viewModel.consulta.collectAsState()

    PantallaRieti(titulo = "Consultar mi reporte", alRegresar = alRegresar) {
        OutlinedTextField(
            value = folio,
            onValueChange = { folio = it.take(20) },
            label = { Text("Folio (RIETI-2026-000123)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = clave,
            onValueChange = { clave = it.take(20) },
            label = { Text("Clave de consulta (XXXX-XXXX-XXXX)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth()
        )
        Button(
            onClick = { viewModel.consultar(folio, clave) },
            enabled = estado !is UiState.Cargando,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
        ) {
            Text(if (estado is UiState.Cargando) "Consultando…" else "Consultar")
        }

        when (val e = estado) {
            is UiState.Cargando -> Cargando()
            is UiState.Error -> MensajeError(e.mensaje)
            is UiState.Exito -> {
                val c = e.datos
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(c.folio, style = MaterialTheme.typography.titleMedium)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Estado actual: ", style = MaterialTheme.typography.bodyLarge)
                            EtiquetaEstatus(c.estatus)
                        }
                        Text("Registrado el ${formatearFecha(c.fechaCreacion)}", style = MaterialTheme.typography.bodySmall)
                        Text("Historial", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
                        c.historial.forEach { ev ->
                            Text("• ${ev.estatus} — ${formatearFecha(ev.fecha)}", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            is UiState.Inactivo -> Text(
                "Escribe el folio y la clave que recibiste al enviar tu reporte.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
