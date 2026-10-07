package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import mx.sipinna.rieti.viewmodel.SeguimientoViewModel

/**
 * Pantalla de seguimiento de un caso por folio (CU-08 ciudadano / CU-09-10 personal SIPINNA).
 *
 * [esAdmin] llega por argumento de navegación desde [LoginScreen]/[HomeScreen];
 * según su valor se muestran los controles de edición (solo para personal
 * SIPINNA) o solo el texto de lectura (ciudadano). Si el caso tiene
 * coordenadas GPS capturadas al registrarse, se muestra el mapa con Coil.
 */
@Composable
fun SeguimientoScreen(esAdmin: Boolean, viewModel: SeguimientoViewModel = viewModel()) {
    var folioBuscado by remember { mutableStateOf("") }
    var comentarioNuevo by remember { mutableStateOf("") }

    val caso by viewModel.caso.collectAsState()
    val error by viewModel.error.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Text("Seguimiento de caso", style = MaterialTheme.typography.headlineSmall)

        OutlinedTextField(
            value = folioBuscado,
            onValueChange = { folioBuscado = it },
            label = { Text("Folio (ej. RIETI-2026-0001)") },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
        )

        Button(
            onClick = { viewModel.buscarPorFolio(folioBuscado) },
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
        ) {
            Text("Buscar")
        }

        if (error != null) {
            Text(
                text = error ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        val casoActual = caso
        if (casoActual != null) {
            Text(casoActual.estatus, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 16.dp))
            Text(casoActual.descripcion, modifier = Modifier.padding(top = 6.dp))

            if (casoActual.latitud != null && casoActual.longitud != null) {
                AsyncImage(
                    model = "https://staticmap.openstreetmap.de/staticmap.php?center=${casoActual.latitud},${casoActual.longitud}&zoom=15&size=400x200&markers=${casoActual.latitud},${casoActual.longitud},red-pushpin",
                    contentDescription = "Mapa de la ubicación del reporte",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .padding(top = 10.dp)
                        .clip(RoundedCornerShape(8.dp))
                )
            }

            if (esAdmin) {
                OutlinedTextField(
                    value = comentarioNuevo,
                    onValueChange = { comentarioNuevo = it },
                    label = { Text("Nuevo comentario de seguimiento") },
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                )
                Button(
                    onClick = {
                        viewModel.actualizar(casoActual.id, "En revisión", comentarioNuevo)
                        comentarioNuevo = ""
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                ) {
                    Text("Guardar seguimiento")
                }
            } else {
                Text(
                    casoActual.comentarioAdmin ?: "Sin comentarios aún",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 10.dp)
                )
            }
        }
    }
}
