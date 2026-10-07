package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import mx.sipinna.rieti.viewmodel.HomeViewModel

/** Panel principal de personal SIPINNA, mostrado después de iniciar sesión. */
@Composable
fun HomeScreen(navController: NavHostController, esAdmin: Boolean, viewModel: HomeViewModel = viewModel()) {
    val total by viewModel.totalReportes.collectAsState()

    // Equivalente Compose de onResume(): se vuelve a cargar cada vez que se entra a esta pantalla.
    LaunchedEffect(Unit) {
        viewModel.cargarResumen()
    }

    Column(modifier = Modifier.padding(24.dp)) {
        Text("Panel SIPINNA", style = MaterialTheme.typography.headlineSmall)

        Card(modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Reportes registrados", style = MaterialTheme.typography.bodyMedium)
                Text(
                    total.toString(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        Button(
            onClick = { navController.navigate(Rutas.REPORTES_LIST) },
            modifier = Modifier.fillMaxWidth().padding(top = 20.dp)
        ) {
            Text("Ver reportes")
        }

        Button(
            onClick = { navController.navigate(Rutas.seguimiento(esAdmin)) },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
        ) {
            Text("Dar seguimiento a un caso")
        }
    }
}
