package mx.sipinna.rieti.view

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import mx.sipinna.rieti.model.GestorUbicacion
import mx.sipinna.rieti.viewmodel.FormularioReporteViewModel

/**
 * Formulario de registro de un reporte ciudadano (CU-04).
 *
 * Contiene 4 grupos de chips de selección única (cantidad de niños, edad
 * aproximada, actividad observada, situación de riesgo), construidos con
 * `FilterChip` de Material 3: cada grupo guarda en una variable `remember`
 * cuál es la opción elegida, y ese es el valor real que se envía al backend
 * (antes de esta versión, el formulario mandaba valores fijos sin importar
 * qué tocara el usuario).
 *
 * Además integra GPS: al tocar "Usar mi ubicación actual" se solicita el
 * permiso de ubicación (si no se tiene) y se captura una lectura con
 * [GestorUbicacion]; mientras tanto se muestra, con Coil, un thumbnail de
 * mapa estático centrado en las coordenadas capturadas.
 */
@Composable
fun FormularioReporteScreen(
    navController: NavHostController,
    viewModel: FormularioReporteViewModel = viewModel()
) {
    val contexto = LocalContext.current
    val gestorUbicacion = remember { GestorUbicacion(contexto, viewModel) }

    var ubicacionTexto by remember { mutableStateOf("") }
    var descripcion by remember { mutableStateOf("") }

    var cantidadSeleccionada by remember { mutableStateOf("") }
    var edadSeleccionada by remember { mutableStateOf("") }
    var actividadSeleccionada by remember { mutableStateOf("") }
    var riesgoSeleccionado by remember { mutableStateOf("") }

    val enviando by viewModel.enviando.collectAsState()
    val error by viewModel.error.collectAsState()
    val reporteCreado by viewModel.reporteCreado.collectAsState()
    val latitud by viewModel.latitud.collectAsState()
    val longitud by viewModel.longitud.collectAsState()

    // Lanzador que pide el permiso de ubicación y, si se concede, captura el GPS.
    val lanzadorPermiso = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permisos ->
        val concedido = permisos.values.any { it }
        if (concedido) gestorUbicacion.capturarUbicacionActual()
    }

    if (reporteCreado != null) {
        navController.navigate(Rutas.confirmacion(reporteCreado!!.folio))
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp)
    ) {
        Text("Registrar reporte", style = MaterialTheme.typography.headlineSmall)

        Text("Ubicación", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 16.dp))
        OutlinedTextField(
            value = ubicacionTexto,
            onValueChange = { ubicacionTexto = it },
            label = { Text("Calle, colonia o referencia") },
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = {
                if (gestorUbicacion.tienePermiso()) {
                    gestorUbicacion.capturarUbicacionActual()
                } else {
                    lanzadorPermiso.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                }
            },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
        ) {
            Text("Usar mi ubicación actual (GPS)")
        }

        // Thumbnail de mapa (Coil) centrado en las coordenadas capturadas.
        if (latitud != null && longitud != null) {
            AsyncImage(
                model = "https://staticmap.openstreetmap.de/staticmap.php?center=$latitud,$longitud&zoom=15&size=400x200&markers=$latitud,$longitud,red-pushpin",
                contentDescription = "Mapa de la ubicación capturada",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp)
                    .padding(top = 8.dp)
                    .clip(RoundedCornerShape(8.dp))
            )
        }

        Text("Cantidad de niñas/niños observados", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 16.dp))
        Row {
            listOf("1", "2 a 3", "4 o más").forEach { opcion ->
                FilterChip(
                    selected = cantidadSeleccionada == opcion,
                    onClick = { cantidadSeleccionada = opcion },
                    label = { Text(opcion) },
                    modifier = Modifier.padding(end = 6.dp)
                )
            }
        }

        Text("Edad aproximada", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 16.dp))
        Row {
            listOf("0-5", "6-11", "12-17").forEach { opcion ->
                FilterChip(
                    selected = edadSeleccionada == opcion,
                    onClick = { edadSeleccionada = opcion },
                    label = { Text(opcion) },
                    modifier = Modifier.padding(end = 6.dp)
                )
            }
        }

        Text("Actividad observada", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 16.dp))
        val actividades = listOf(
            "Mendicidad forzada", "Trabajo doméstico", "Venta ambulante",
            "Construcción", "Trabajo agrícola", "Otro"
        )
        Column {
            actividades.chunked(2).forEach { fila ->
                Row {
                    fila.forEach { opcion ->
                        FilterChip(
                            selected = actividadSeleccionada == opcion,
                            onClick = { actividadSeleccionada = opcion },
                            label = { Text(opcion) },
                            modifier = Modifier.padding(end = 6.dp, bottom = 6.dp)
                        )
                    }
                }
            }
        }

        Text("¿Percibes una situación de riesgo?", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
        Row {
            listOf("Sí", "No", "No sé").forEach { opcion ->
                FilterChip(
                    selected = riesgoSeleccionado == opcion,
                    onClick = { riesgoSeleccionado = opcion },
                    label = { Text(opcion) },
                    modifier = Modifier.padding(end = 6.dp)
                )
            }
        }

        Text("Descripción", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 16.dp))
        OutlinedTextField(
            value = descripcion,
            onValueChange = { descripcion = it },
            label = { Text("Describe lo que observaste") },
            modifier = Modifier.fillMaxWidth().height(100.dp)
        )

        if (error != null) {
            Text(
                text = error ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        Button(
            onClick = {
                viewModel.enviarReporte(
                    ubicacion = ubicacionTexto,
                    descripcion = descripcion,
                    cantidadNinos = cantidadATexto(cantidadSeleccionada),
                    edadAproximada = edadSeleccionada,
                    actividad = actividadSeleccionada,
                    situacionRiesgo = riesgoSeleccionado
                )
            },
            enabled = !enviando,
            modifier = Modifier.fillMaxWidth().padding(top = 20.dp)
        ) {
            Text(if (enviando) "Enviando..." else "Enviar reporte")
        }
    }
}

/** Convierte el texto del chip de cantidad ("1", "2 a 3", "4 o más") a un entero aproximado. */
private fun cantidadATexto(textoChip: String): Int = when (textoChip) {
    "1" -> 1
    "2 a 3" -> 2
    "4 o más" -> 4
    else -> 0
}
