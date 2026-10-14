package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Create
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.ui.theme.TextoSecundario
import mx.sipinna.rieti.viewmodel.ConsultaViewModel
import mx.sipinna.rieti.viewmodel.ExtractorFolioClave
import mx.sipinna.rieti.viewmodel.UiState

/**
 * Consulta del estado de un reporte con folio + clave (CU-08, RF-38, RF-47).
 * Solo muestra estatus y fechas; nunca la descripción ni notas del personal.
 *
 * Los campos interpretan lo que se escribe o pega con [ExtractorFolioClave]:
 * si se pega el bloque "Folio: … Clave: …" en cualquiera de los dos, se
 * rellenan ambos con los valores limpios. El botón "Pegar" hace lo mismo con
 * el contenido del portapapeles.
 *
 * @param alRegresar vuelve al inicio
 */
@Composable
fun ConsultaScreen(alRegresar: () -> Unit, viewModel: ConsultaViewModel = viewModel()) {
    var folio by rememberSaveable { mutableStateOf("") }
    var clave by rememberSaveable { mutableStateOf("") }
    var avisoPegar by rememberSaveable { mutableStateOf<String?>(null) }
    val estado by viewModel.consulta.collectAsState()
    val portapapeles = LocalClipboardManager.current

    PantallaRieti(titulo = "Consultar mi reporte", alRegresar = alRegresar) {
        Text(
            "Escribe o pega el folio y la clave que recibiste al enviar tu reporte.",
            style = MaterialTheme.typography.bodyLarge
        )
        OutlinedTextField(
            value = folio,
            onValueChange = { nuevo ->
                val (f, c) = ExtractorFolioClave.alCambiar(nuevo, enCampoFolio = true, folioActual = folio, claveActual = clave)
                folio = f; clave = c; avisoPegar = null
            },
            label = { Text("Folio") },
            placeholder = { Text("RIETI-2026-000123") },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = clave,
            onValueChange = { nuevo ->
                val (f, c) = ExtractorFolioClave.alCambiar(nuevo, enCampoFolio = false, folioActual = folio, claveActual = clave)
                folio = f; clave = c; avisoPegar = null
            },
            label = { Text("Clave de consulta") },
            placeholder = { Text("XXXX-XXXX-XXXX") },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth()
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(
                onClick = {
                    val texto = portapapeles.getText()?.text.orEmpty()
                    val r = ExtractorFolioClave.alPegar(texto, folio, clave)
                    if (r != null) {
                        folio = r.first; clave = r.second; avisoPegar = null
                    } else {
                        avisoPegar = "El portapapeles no tiene un folio ni una clave."
                    }
                },
                modifier = Modifier.heightIn(min = 48.dp)
            ) {
                Icon(Icons.Filled.Create, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                Text("Pegar", modifier = Modifier.padding(start = 8.dp))
            }
            Button(
                onClick = { viewModel.consultar(folio, clave) },
                enabled = estado !is UiState.Cargando,
                modifier = Modifier.weight(1f).heightIn(min = 48.dp)
            ) {
                Text(if (estado is UiState.Cargando) "Consultando…" else "Consultar")
            }
        }
        avisoPegar?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = TextoSecundario, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }

        when (val e = estado) {
            is UiState.Cargando -> Cargando()
            is UiState.Error -> MensajeError(e.mensaje)
            is UiState.Exito -> {
                val c = e.datos
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(c.folio, style = MaterialTheme.typography.titleMedium, fontFamily = FontFamily.Monospace)
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
            is UiState.Inactivo -> Unit
        }
    }
}
