package mx.sipinna.rieti.view

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import mx.sipinna.rieti.model.Reporte
import mx.sipinna.rieti.viewmodel.ReportesListViewModel

/**
 * Lista de reportes/casos (CU-09), usada por personal SIPINNA.
 *
 * Se usa `LazyColumn` (equivalente Compose de un RecyclerView) en vez del
 * inflado manual de items que se usaba en la versión XML de la app.
 */
@Composable
fun ReportesListScreen(navController: NavHostController, viewModel: ReportesListViewModel = viewModel()) {
    val reportes by viewModel.reportes.collectAsState()
    val cargando by viewModel.cargando.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.cargarReportes()
    }

    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Text("Reportes", style = MaterialTheme.typography.headlineSmall)

        if (cargando) {
            Text("Cargando...", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
        }

        LazyColumn(modifier = Modifier.padding(top = 12.dp)) {
            items(reportes) { reporte -> ItemReporte(reporte) }
        }
    }
}

@Composable
private fun ItemReporte(reporte: Reporte) {
    Card(modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(reporte.folio, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium)
            Text(reporte.ubicacion, modifier = Modifier.padding(top = 4.dp))
            Text(reporte.estatus, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        }
    }
}
