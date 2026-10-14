package mx.sipinna.rieti.view

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.model.GestorUbicacion
import mx.sipinna.rieti.model.Municipio
import mx.sipinna.rieti.model.MunicipioSugerido
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.viewmodel.DatosDireccion
import mx.sipinna.rieti.viewmodel.FormularioReporteViewModel
import mx.sipinna.rieti.viewmodel.UiState
import mx.sipinna.rieti.viewmodel.ValidadorReporte
import org.osmdroid.util.GeoPoint

/**
 * Formulario de reporte anónimo (CU-04, Fase 2).
 *
 * - **Dónde:** municipio con búsqueda (D-16), mapa OSM para marcar el punto
 *   (tocando o arrastrando el marcador) u "Usar mi ubicación" (permiso opcional),
 *   y dirección editable que se autorrellena desde el mapa sin borrar lo escrito.
 *   Si el punto cae en otro municipio, se ofrece cambiarlo.
 * - **Menores por grupo de edad** con contadores (total ≤ 50).
 * - **Actividad** en un selector desplegable; "Otro" pide describirla.
 * - Riesgo percibido y descripción.
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

    // Dirección (cada campo se guarda al girar la pantalla) y campos que la persona editó a mano.
    var calle by rememberSaveable { mutableStateOf("") }
    var numero by rememberSaveable { mutableStateOf("") }
    var colonia by rememberSaveable { mutableStateOf("") }
    var codigoPostal by rememberSaveable { mutableStateOf("") }
    var referencias by rememberSaveable { mutableStateOf("") }
    var editados by rememberSaveable { mutableStateOf("") } // nombres separados por comas
    fun marcarEditado(campo: String) {
        if (campo !in editados.split(",")) editados = "$editados,$campo"
    }

    var conteos by rememberSaveable { mutableStateOf(HashMap<String, Int>()) }
    var actividad by rememberSaveable { mutableStateOf("") }
    var actividadOtro by rememberSaveable { mutableStateOf("") }
    var riesgo by rememberSaveable { mutableStateOf("") }
    var descripcion by rememberSaveable { mutableStateOf("") }
    var permisoNegado by rememberSaveable { mutableStateOf(false) }

    var municipio by remember { mutableStateOf<Municipio?>(null) }
    var municipioPropuesto by remember { mutableStateOf<MunicipioSugerido?>(null) }
    val catalogoMunicipios by viewModel.municipios.collectAsState()
    val actividades by viewModel.actividades.collectAsState()
    LaunchedEffect(Unit) {
        viewModel.cargarMunicipios()
        viewModel.cargarActividades()
    }

    val envio by viewModel.envio.collectAsState()
    val punto by viewModel.ubicacion.collectAsState()
    val sugerencia by viewModel.sugerencia.collectAsState()
    val buscando by viewModel.buscandoDireccion.collectAsState()
    val avisoGeo by viewModel.avisoGeo.collectAsState()

    // Aplica cada sugerencia del mapa una sola vez: rellena lo que no se editó y propone el municipio.
    LaunchedEffect(sugerencia?.id) {
        val s = sugerencia?.datos ?: return@LaunchedEffect
        val nueva = ValidadorReporte.aplicarSugerencia(
            DatosDireccion(calle, numero, colonia, codigoPostal, referencias), editados.split(",").toSet(),
            s.direccion.calle, s.direccion.numeroExterior, s.direccion.colonia, s.direccion.codigoPostal
        )
        calle = nueva.calle; numero = nueva.numero; colonia = nueva.colonia; codigoPostal = nueva.codigoPostal
        val sugerido = s.municipioSugerido
        val lista = (catalogoMunicipios as? UiState.Exito)?.datos.orEmpty()
        when {
            sugerido == null -> municipioPropuesto = null
            municipio == null -> { municipio = lista.find { it.id == sugerido.id }; municipioPropuesto = null }
            municipio?.id != sugerido.id -> municipioPropuesto = sugerido
            else -> municipioPropuesto = null
        }
    }

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
            style = MaterialTheme.typography.bodyMedium
        )

        // ---------- ¿Dónde ocurre? ----------
        Seccion("¿Dónde ocurre?")
        when (val c = catalogoMunicipios) {
            is UiState.Exito -> SelectorMunicipio(
                municipios = c.datos,
                seleccionado = municipio,
                alElegir = { municipio = it; municipioPropuesto = null },
                error = (envio as? UiState.Error)?.mensaje?.takeIf { municipio == null && it.contains("municipio") }
                    ?.let { "Elige el municipio donde ocurre" }
            )
            is UiState.Error -> {
                MensajeError("No se pudo cargar la lista de municipios. ${c.mensaje}")
                OutlinedButton(onClick = viewModel::cargarMunicipios, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Reintentar") }
            }
            else -> Cargando()
        }

        NotaCampo("Toca el mapa o mantén presionado el marcador para moverlo. Es opcional.")
        val geoPunto = remember(punto) { punto?.let { GeoPoint(it.latitud, it.longitud) } }
        MapaUbicacion(punto = geoPunto, alMover = viewModel::alMoverMarcador)

        OutlinedButton(
            onClick = {
                if (gestorUbicacion.tienePermiso()) gestorUbicacion.capturarUbicacionActual()
                else lanzadorPermiso.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
        ) {
            Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
            Text("Estoy en el lugar: usar mi ubicación", modifier = Modifier.padding(start = 8.dp))
        }
        if (permisoNegado) NotaCampo("Sin permiso de ubicación. Marca el punto en el mapa o escribe la dirección.")
        punto?.let { p ->
            if (p.esImprecisa) NotaCampo("Tu ubicación es poco precisa (más de 100 m). Ajusta el marcador si hace falta.")
            TextButton(onClick = viewModel::quitarUbicacion, modifier = Modifier.heightIn(min = 48.dp)) { Text("No enviar el punto del mapa") }
        }
        if (buscando) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                NotaCampo("Buscando la dirección…")
            }
        }
        avisoGeo?.let { NotaCampo(it) }
        municipioPropuesto?.let { propuesto ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("El punto del mapa está en ${propuesto.nombre}, no en ${municipio?.nombre}.", style = MaterialTheme.typography.bodyMedium)
                    Button(
                        onClick = {
                            municipio = (catalogoMunicipios as? UiState.Exito)?.datos?.find { it.id == propuesto.id }
                            municipioPropuesto = null
                        },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    ) { Text("Cambiar a ${propuesto.nombre}") }
                }
            }
        }

        CampoTexto("Calle", calle, ValidadorReporte.MAX_CALLE) { calle = it; marcarEditado("calle") }
        CampoTexto("Número exterior (opcional)", numero, ValidadorReporte.MAX_NUMERO) { numero = it; marcarEditado("numero") }
        CampoTexto("Colonia", colonia, ValidadorReporte.MAX_COLONIA) { colonia = it; marcarEditado("colonia") }
        CampoTexto("Código postal", codigoPostal, 5, KeyboardType.Number) {
            codigoPostal = it.filter(Char::isDigit); marcarEditado("codigoPostal")
        }
        CampoTexto("Referencias (opcional)", referencias, ValidadorReporte.MAX_REFERENCIAS, ayuda = "Ej.: frente al mercado, esquina con la calle 5") {
            referencias = it
        }

        // ---------- Menores ----------
        Seccion("¿Cuántas niñas, niños o adolescentes viste?")
        NotaCampo("Suma uno por cada persona en su grupo de edad.")
        ContadorEdades(conteos) { rango, n -> conteos = HashMap(conteos).apply { put(rango, n.coerceAtLeast(0)) } }

        // ---------- Actividad ----------
        Seccion("¿Qué actividad realizaban?")
        SelectorActividad(actividades, actividad) { actividad = it }
        if (actividad == ValidadorReporte.ACTIVIDAD_OTRO) {
            CampoTexto("Describe la actividad", actividadOtro, ValidadorReporte.MAX_ACTIVIDAD_OTRO) { actividadOtro = it }
        }

        // ---------- Riesgo ----------
        Seccion("¿Percibes una situación de riesgo?")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ValidadorReporte.RIESGOS.forEach { opcion ->
                FilterChip(
                    selected = riesgo == opcion,
                    onClick = { riesgo = opcion },
                    label = { Text(opcion) },
                    modifier = Modifier.heightIn(min = 48.dp)
                )
            }
        }

        // ---------- Descripción ----------
        Seccion("Describe lo que observaste")
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
            onClick = {
                viewModel.enviar(
                    municipio, DatosDireccion(calle, numero, colonia, codigoPostal, referencias),
                    conteos, actividad, actividadOtro, riesgo, descripcion, avisoVersion
                )
            },
            enabled = envio !is UiState.Cargando,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(top = 8.dp)
        ) {
            Text(if (envio is UiState.Cargando) "Enviando…" else "Enviar reporte")
        }
    }
}

/** Encabezado de sección del formulario (con espacio arriba para separar bloques). */
@Composable
private fun Seccion(texto: String) {
    Text(
        texto,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(top = 16.dp).semantics { heading() }
    )
}

/** Campo de texto de una línea con límite de largo. */
@Composable
private fun CampoTexto(
    etiqueta: String,
    valor: String,
    maximo: Int,
    teclado: KeyboardType = KeyboardType.Text,
    ayuda: String? = null,
    alCambiar: (String) -> Unit
) {
    OutlinedTextField(
        value = valor,
        onValueChange = { if (it.length <= maximo) alCambiar(it) },
        label = { Text(etiqueta) },
        supportingText = ayuda?.let { { Text(it) } },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = teclado),
        modifier = Modifier.fillMaxWidth()
    )
}
