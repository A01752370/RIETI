package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Pantalla de inicio. El ciudadano no necesita cuenta (D-12): puede reportar
 * de forma anónima o consultar un reporte con su folio y clave. El personal
 * SIPINNA entra por un acceso aparte.
 *
 * @param alReportar abre el aviso de privacidad y luego el formulario
 * @param alConsultar abre la consulta con folio + clave
 * @param alEntrarPersonal abre el inicio de sesión del personal
 */
@Composable
fun InicioScreen(alReportar: () -> Unit, alConsultar: () -> Unit, alEntrarPersonal: () -> Unit) {
    PantallaRieti(titulo = "RIETI") {
        Text(
            "Reporta posibles situaciones de trabajo infantil en la Ruta Intermunicipal",
            style = MaterialTheme.typography.headlineSmall
        )
        Text(
            "Tu reporte llega al SIPINNA de Atizapán de Zaragoza para su revisión y seguimiento.",
            style = MaterialTheme.typography.bodyLarge
        )

        AvisoEmergencia()

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Reporte anónimo", style = MaterialTheme.typography.titleMedium)
                Text(
                    "No pedimos tu nombre ni tus datos. Al enviar recibirás un folio y una clave " +
                        "para dar seguimiento a tu reporte.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Button(onClick = alReportar, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text("Reportar una situación")
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("¿Ya reportaste?", style = MaterialTheme.typography.titleMedium)
                Text("Consulta el estado de tu reporte con tu folio y tu clave.", style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(onClick = alConsultar, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text("Consultar mi reporte")
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        TextButton(onClick = alEntrarPersonal, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text("Soy personal SIPINNA")
        }
        Text(
            "RIETI no realiza inspecciones ni sustituye una denuncia formal ante el Ministerio Público.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
