package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController

/**
 * Pantalla de confirmación mostrada después de registrar un reporte con éxito.
 *
 * Recibe el folio como argumento de navegación desde [FormularioReporteScreen];
 * no necesita ViewModel con lógica de red porque el folio ya viene resuelto.
 */
@Composable
fun ConfirmacionScreen(navController: NavHostController, folio: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("¡Reporte enviado!", style = MaterialTheme.typography.headlineSmall)
        Text("Guarda tu folio para dar seguimiento:", modifier = Modifier.padding(top = 8.dp))
        Text(
            folio,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = 16.dp)
        )

        Button(
            onClick = {
                navController.navigate(Rutas.LOGIN) {
                    popUpTo(Rutas.LOGIN) { inclusive = true }
                }
            },
            modifier = Modifier.fillMaxWidth().padding(top = 32.dp)
        ) {
            Text("Volver al inicio")
        }
    }
}
