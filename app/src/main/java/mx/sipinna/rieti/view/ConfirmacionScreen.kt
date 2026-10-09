package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

/**
 * Confirmación del reporte: muestra folio y clave de consulta una sola vez.
 *
 * El servidor solo guarda el hash de la clave, así que si se pierde no se puede
 * recuperar; por eso se insiste en guardarla. No se guarda en el teléfono.
 *
 * @param folio folio asignado
 * @param clave clave de consulta
 * @param alTerminar vuelve al inicio
 */
@Composable
fun ConfirmacionScreen(folio: String, clave: String, alTerminar: () -> Unit) {
    val portapapeles = LocalClipboardManager.current
    var copiado by rememberSaveable { mutableStateOf(false) }

    PantallaRieti(titulo = "Reporte enviado") {
        Text("Gracias. Recibimos tu reporte.", style = MaterialTheme.typography.headlineSmall)
        Text(
            "El personal del SIPINNA lo revisará. Con estos datos puedes consultar su avance:",
            style = MaterialTheme.typography.bodyLarge
        )

        Card(Modifier.fillMaxWidth()) {
            SelectionContainer {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Folio", style = MaterialTheme.typography.labelLarge)
                    Text(folio, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Monospace)
                    Text("Clave de consulta", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
                    Text(clave, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Monospace)
                }
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                "Anota o guarda el folio y la clave ahora. Por tu privacidad no los guardamos en el teléfono " +
                    "y la clave no se puede recuperar.",
                color = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.padding(12.dp)
            )
        }

        OutlinedButton(
            onClick = {
                portapapeles.setText(AnnotatedString("Folio: $folio\nClave: $clave"))
                copiado = true
            },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
        ) {
            Text(if (copiado) "Copiados al portapapeles" else "Copiar folio y clave")
        }

        Button(onClick = alTerminar, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text("Ya los guardé, volver al inicio")
        }
    }
}
