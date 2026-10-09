package mx.sipinna.rieti.view

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.Locale
import mx.sipinna.rieti.model.GestorUbicacion
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.viewmodel.FormularioReporteViewModel
import mx.sipinna.rieti.viewmodel.UiState
import mx.sipinna.rieti.viewmodel.ValidadorReporte

/**
 * Formulario de reporte anónimo (CU-04).
 *
 * Grupos de chips de selección única (cantidad, edad, actividad, riesgo),
 * referencia del lugar y descripción. La ubicación del GPS es opcional, se pide
 * solo al tocar el botón y se envía como lugar de los hechos (CU-03); si el
 * permiso se niega, el reporte se puede enviar igual (CU-03 E1).
 *
 * @param avisoVersion versión del aviso de privacidad aceptada en la pantalla anterior
 * @param alEnviar navega a la confirmación con el folio y la clave
 * @param alRegresar vuelve al aviso
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FormularioReporteScreen(
    avisoVersion: String,
    alEnviar: (ReporteCreado) -> Unit,
    alRegresar: () -> Unit,
    viewModel: FormularioReporteViewModel = viewModel()
) {
    val contexto = LocalContext.current
    val gestorUbicacion = remember { GestorUbicacion(contexto, viewModel) }

    var ubicacionTexto by rememberSaveable { mutableStateOf("") }
    var descripcion by rememberSaveable { mutableStateOf("") }
    var cantidad by rememberSaveable { mutableStateOf("") }
    var edad by rememberSaveable { mutableStateOf("") }
    var actividad by rememberSaveable { mutableStateOf("") }
    var riesgo by rememberSaveable { mutableStateOf("") }
    var permisoNegado by rememberSaveable { mutableStateOf(false) }

    val envio by viewModel.envio.collectAsState()
    val gps by viewModel.ubicacion.collectAsState()

    val lanzadorPermiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permisos ->
        if (permisos.values.any { it }) {
            permisoNegado = false
            gestorUbicacion.capturarUbicacionActual()
        } else {
            permisoNegado = true
        }
    }

    LaunchedEffect(envio) {
        val e = envio
        if (e is UiState.Exito) {
            viewModel.reiniciarEnvio()
            alEnviar(e.datos)
        }
    }

    PantallaRieti(titulo = "Reportar una situación", alRegresar = alRegresar) {
        AvisoEmergencia()
        Text(
            "No escribas nombres, CURP ni domicilios de las niñas, niños o adolescentes.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Titulo("¿Dónde ocurre?")
        OutlinedTextField(
            value = ubicacionTexto,
            onValueChange = { if (it.length <= ValidadorReporte.MAX_UBICACION) ubicacionTexto = it },
            label = { Text("Calle, colonia o punto de referencia") },
            modifier = Modifier.fillMaxWidth()
        )
        val lectura = gps
        if (lectura == null) {
            OutlinedButton(
                onClick = {
                    if (gestorUbicacion.tienePermiso()) {
                        gestorUbicacion.capturarUbicacionActual()
                    } else {
                        lanzadorPermiso.launch(
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
            ) {
                Text("Estoy en el lugar: usar mi ubicación actual")
            }
            if (permisoNegado) {
                Text(
                    "Sin permiso de ubicación. Puedes enviar el reporte solo con la referencia escrita.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        } else {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Ubicación del lugar de los hechos", style = MaterialTheme.typography.labelLarge)
                    Text(String.format(Locale.US, "%.5f, %.5f", lectura.latitud, lectura.longitud))
                    if (lectura.esImprecisa) {
                        Text(
                            "La ubicación es poco precisa (más de 100 m). Agrega una referencia detallada.",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    TextButton(onClick = viewModel::quitarUbicacion) { Text("No enviar esta ubicación") }
                }
            }
        }

        Titulo("¿Cuántas niñas o niños viste?")
        Opciones(ValidadorReporte.CANTIDADES.keys.toList(), cantidad) { cantidad = it }

        Titulo("Edad aproximada")
        Opciones(ValidadorReporte.EDADES, edad) { edad = it }

        Titulo("¿Qué actividad realizaban?")
        Opciones(ValidadorReporte.ACTIVIDADES, actividad) { actividad = it }

        Titulo("¿Percibes una situación de riesgo?")
        Opciones(ValidadorReporte.RIESGOS, riesgo) { riesgo = it }

        Titulo("Describe lo que observaste")
        OutlinedTextField(
            value = descripcion,
            onValueChange = { if (it.length <= ValidadorReporte.MAX_DESCRIPCION) descripcion = it },
            label = { Text("Qué viste, a qué hora, señas del lugar") },
            supportingText = { Text("${descripcion.length}/${ValidadorReporte.MAX_DESCRIPCION}") },
            minLines = 4,
            modifier = Modifier.fillMaxWidth()
        )

        (envio as? UiState.Error)?.let { MensajeError(it.mensaje) }

        Button(
            onClick = { viewModel.enviar(ubicacionTexto, cantidad, edad, actividad, riesgo, descripcion, avisoVersion) },
            enabled = envio !is UiState.Cargando,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)
        ) {
            Text(if (envio is UiState.Cargando) "Enviando…" else "Enviar reporte")
        }
    }
}

/** Subtítulo de sección del formulario. */
@Composable
private fun Titulo(texto: String) {
    Text(texto, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
}

/** Grupo de chips de selección única. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Opciones(opciones: List<String>, seleccion: String, alElegir: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        opciones.forEach { opcion ->
            FilterChip(
                selected = seleccion == opcion,
                onClick = { alElegir(opcion) },
                label = { Text(opcion) },
                modifier = Modifier.heightIn(min = 48.dp)
            )
        }
    }
}
