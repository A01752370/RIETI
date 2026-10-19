package mx.sipinna.rieti.view

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.activity.result.PickVisualMediaRequest
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.text.font.FontWeight
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID
import kotlinx.coroutines.launch
import mx.sipinna.rieti.viewmodel.ReglasFotos
import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.RadioButton
import androidx.compose.material.icons.filled.Call
import android.content.Intent
import androidx.core.net.toUri
import mx.sipinna.rieti.ui.theme.TintePrimario
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.model.GestorUbicacion
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.repository.SesionCiudadanoRepositorio
import mx.sipinna.rieti.ui.theme.TextoSecundario
import mx.sipinna.rieti.viewmodel.AsistenteReporte
import mx.sipinna.rieti.viewmodel.CampoReporte
import mx.sipinna.rieti.viewmodel.EstadoAsistente
import mx.sipinna.rieti.viewmodel.FormatoReporte
import mx.sipinna.rieti.viewmodel.FormularioReporteViewModel
import mx.sipinna.rieti.viewmodel.PasoReporte
import mx.sipinna.rieti.viewmodel.UiState
import mx.sipinna.rieti.viewmodel.ValidadorReporte
import org.osmdroid.util.GeoPoint

/**
 * Asistente de reporte anónimo en 4 pasos (CU-04; Fase 5): **Dónde**, **A quiénes**,
 * **Qué ocurre** y **Revisar y enviar**.
 *
 * - Arriba, el indicador de pasos; abajo, la barra de progreso "Paso N de 4" y el botón principal.
 * - No se avanza si faltan datos del paso: los errores aparecen junto al campo y en un resumen.
 * - "Atrás" (de la pantalla o del sistema) regresa un paso sin perder nada; en el primer paso
 *   sale, con confirmación si ya se capturó algo.
 * - Lo capturado vive solo en memoria (ViewModel); no hay borradores en disco.
 * - El cuerpo que se envía es el mismo que el del formulario de una sola pantalla.
 *
 * @param avisoVersion versión del aviso de privacidad aceptada en la pantalla anterior
 * @param alEnviar navega a la confirmación con el folio, la clave y cuántas fotos se adjuntaron (-1 si falló la subida)
 * @param alRegresar vuelve al aviso
 * @param alCuenta abre el acceso a la cuenta opcional (reporte con seguimiento) y regresa aquí sin perder lo capturado
 */
@Composable
fun FormularioReporteScreen(
    avisoVersion: String,
    alEnviar: (ReporteCreado, Int) -> Unit,
    alRegresar: () -> Unit,
    alCuenta: () -> Unit = {},
    viewModel: FormularioReporteViewModel = viewModel()
) {
    val estado by viewModel.asistente.collectAsState()
    val envio by viewModel.envio.collectAsState()
    val haySesionCiudadano by SesionCiudadanoRepositorio.haySesion.collectAsState()
    var confirmarSalida by remember { mutableStateOf(false) }
    val desplazamiento = rememberScrollState()
    val sinAnimaciones = animacionesReducidas()

    LaunchedEffect(Unit) {
        viewModel.cargarMunicipios()
        viewModel.cargarActividades()
    }
    LaunchedEffect(envio) {
        val e = envio
        if (e is UiState.Exito) {
            viewModel.reiniciarEnvio()
            alEnviar(e.datos, viewModel.fotosAdjuntadas)
        }
    }
    // Cada paso empieza arriba; si un intento de avanzar falla, también se sube para ver el resumen.
    // (Corregir campos no mueve la pantalla.)
    LaunchedEffect(estado.paso, estado.intentosFallidos) {
        if (sinAnimaciones) desplazamiento.scrollTo(0) else desplazamiento.animateScrollTo(0)
    }

    val atras = {
        if (!viewModel.retroceder()) {
            if (AsistenteReporte.hayDatos(estado.datos)) confirmarSalida = true else alRegresar()
        }
    }
    BackHandler(onBack = atras)

    PantallaRieti(
        titulo = "Reportar una situación",
        alRegresar = atras,
        desplazamiento = desplazamiento,
        barraInferior = {
            BarraAsistente(
                estado = estado,
                enviando = envio is UiState.Cargando,
                alAtras = atras,
                alContinuar = {
                    if (estado.paso == PasoReporte.REVISAR) viewModel.enviar(avisoVersion, haySesionCiudadano)
                    else viewModel.avanzar(haySesionCiudadano)
                }
            )
        }
    ) {
        IndicadorPasos(
            pasos = PasoReporte.entries.map { it.titulo },
            actual = estado.paso.ordinal,
            maximo = estado.maximo.ordinal,
            alElegir = { viewModel.irA(PasoReporte.entries[it]) }
        )
        Text(
            tituloPaso(estado.paso),
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics {
                heading()
                liveRegion = LiveRegionMode.Polite
            }
        )
        if (estado.errores.isNotEmpty()) {
            MensajeError("Revisa antes de continuar:\n" + estado.errores.values.distinct().joinToString("\n") { "• $it" })
        }

        AnimatedContent(
            targetState = estado.paso,
            transitionSpec = { transicionPaso(initialState, targetState, sinAnimaciones) },
            label = "paso"
        ) { paso ->
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (paso) {
                    PasoReporte.COMO -> PasoComo(estado, haySesionCiudadano, alCuenta, viewModel)
                    PasoReporte.DONDE -> PasoDonde(estado, viewModel)
                    PasoReporte.QUIENES -> PasoQuienes(estado, viewModel)
                    PasoReporte.QUE -> PasoQue(estado, viewModel)
                    PasoReporte.REVISAR -> PasoRevisar(estado, haySesionCiudadano, viewModel)
                }
            }
        }
        (envio as? UiState.Error)?.let { MensajeError(it.mensaje) }
    }

    if (confirmarSalida) {
        AlertDialog(
            onDismissRequest = { confirmarSalida = false },
            title = { Text("¿Salir sin enviar?") },
            text = { Text("Lo que capturaste se borrará. Por tu privacidad no guardamos borradores.") },
            confirmButton = {
                TextButton(onClick = { confirmarSalida = false; alRegresar() }) { Text("Salir") }
            },
            dismissButton = {
                TextButton(onClick = { confirmarSalida = false }) { Text("Seguir reportando") }
            }
        )
    }
}

/** Título visible de cada paso (una pregunta corta). */
private fun tituloPaso(paso: PasoReporte): String = when (paso) {
    PasoReporte.COMO -> "¿Cómo quieres realizar tu reporte?"
    PasoReporte.DONDE -> "¿Dónde ocurre?"
    PasoReporte.QUIENES -> "¿A quiénes viste?"
    PasoReporte.QUE -> "¿Qué ocurre?"
    PasoReporte.REVISAR -> "Revisa y envía"
}

/** Deslizamiento sutil hacia el lado del avance; instantáneo si se quitaron las animaciones del sistema. */
private fun transicionPaso(desde: PasoReporte, hacia: PasoReporte, sinAnimaciones: Boolean): ContentTransform {
    if (sinAnimaciones) return EnterTransition.None togetherWith ExitTransition.None
    val adelante = hacia.ordinal > desde.ordinal
    val entrada = slideInHorizontally(tween(220)) { ancho -> if (adelante) ancho / 6 else -ancho / 6 } + fadeIn(tween(220))
    val salida = slideOutHorizontally(tween(160)) { ancho -> if (adelante) -ancho / 6 else ancho / 6 } + fadeOut(tween(160))
    return entrada togetherWith salida
}

/** Barra inferior fija: progreso segmentado, "Atrás" y el botón principal redondeado con flecha. */
@Composable
private fun BarraAsistente(estado: EstadoAsistente, enviando: Boolean, alAtras: () -> Unit, alContinuar: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BarraProgresoPasos(PasoReporte.entries.size, estado.paso.ordinal, estado.paso.titulo)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (estado.paso != PasoReporte.entries.first()) {
                OutlinedButton(onClick = alAtras, modifier = Modifier.heightIn(min = 56.dp)) { Text("Atrás") }
            }
            val ultimo = estado.paso == PasoReporte.REVISAR
            Button(
                onClick = alContinuar,
                enabled = !enviando,
                shape = MaterialTheme.shapes.extraLarge,
                modifier = Modifier.weight(1f).heightIn(min = 56.dp)
            ) {
                Text(
                    when {
                        enviando -> "Enviando…"
                        ultimo -> "Enviar reporte"
                        estado.maximo == PasoReporte.REVISAR -> "Guardar y revisar"
                        else -> "Continuar"
                    },
                    style = MaterialTheme.typography.titleMedium
                )
                Icon(
                    if (ultimo) Icons.AutoMirrored.Filled.Send else Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.padding(start = 8.dp).size(ButtonDefaults.IconSize)
                )
            }
        }
    }
}

// ---------- Paso 1: Dónde ----------

/** Municipio, mapa (o ubicación actual) y dirección del lugar de los hechos. */
@Composable
private fun PasoDonde(estado: EstadoAsistente, viewModel: FormularioReporteViewModel) {
    val contexto = LocalContext.current
    val gestorUbicacion = remember { GestorUbicacion(contexto, viewModel) }
    var permisoNegado by remember { mutableStateOf(false) }
    val catalogo by viewModel.municipios.collectAsState()
    val punto by viewModel.ubicacion.collectAsState()
    val propuesto by viewModel.municipioPropuesto.collectAsState()
    val buscando by viewModel.buscandoDireccion.collectAsState()
    val avisoGeo by viewModel.avisoGeo.collectAsState()
    val d = estado.datos
    val e = estado.errores

    val lanzadorPermiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permisos ->
        if (permisos.values.any { it }) {
            permisoNegado = false
            gestorUbicacion.capturarUbicacionActual()
        } else {
            permisoNegado = true
        }
    }

    NotaCampo("Es la dirección del lugar de los hechos, no la tuya.")
    when (val c = catalogo) {
        is UiState.Exito -> SelectorMunicipio(
            municipios = c.datos,
            seleccionado = d.municipio,
            alElegir = viewModel::elegirMunicipio,
            error = e[CampoReporte.MUNICIPIO]
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
    propuesto?.let { p ->
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("El punto del mapa está en ${p.nombre}, no en ${d.municipio?.nombre}.", style = MaterialTheme.typography.bodyMedium)
                Button(onClick = viewModel::aceptarMunicipioPropuesto, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text("Cambiar a ${p.nombre}")
                }
            }
        }
    }

    CampoTexto("Calle", d.direccion.calle, ValidadorReporte.MAX_CALLE, error = e[CampoReporte.CALLE] ?: e[CampoReporte.DIRECCION]) { v ->
        viewModel.actualizar(CampoReporte.CALLE, CampoReporte.DIRECCION) { it.copy(direccion = it.direccion.copy(calle = v), editados = it.editados + "calle") }
    }
    CampoTexto("Número exterior (opcional)", d.direccion.numero, ValidadorReporte.MAX_NUMERO) { v ->
        viewModel.actualizar(CampoReporte.DIRECCION) { it.copy(direccion = it.direccion.copy(numero = v), editados = it.editados + "numero") }
    }
    CampoTexto("Colonia", d.direccion.colonia, ValidadorReporte.MAX_COLONIA, error = e[CampoReporte.COLONIA]) { v ->
        viewModel.actualizar(CampoReporte.COLONIA, CampoReporte.DIRECCION) { it.copy(direccion = it.direccion.copy(colonia = v), editados = it.editados + "colonia") }
    }
    CampoTexto("Código postal", d.direccion.codigoPostal, 5, KeyboardType.Number, error = e[CampoReporte.CODIGO_POSTAL]) { v ->
        viewModel.actualizar(CampoReporte.CODIGO_POSTAL) {
            it.copy(direccion = it.direccion.copy(codigoPostal = v.filter(Char::isDigit)), editados = it.editados + "codigoPostal")
        }
    }
    CampoTexto("Referencias (opcional)", d.direccion.referencias, ValidadorReporte.MAX_REFERENCIAS, ayuda = "Ej.: frente al mercado, esquina con la calle 5") { v ->
        viewModel.actualizar(CampoReporte.DIRECCION) { it.copy(direccion = it.direccion.copy(referencias = v)) }
    }
}

// ---------- Paso 1: Cómo reportar ----------

/**
 * Elegir cómo reportar (Fase 6): **anónimo** por defecto, o **con seguimiento** usando la
 * cuenta opcional (correo y "Mi panel"). No se pide nombre, teléfono ni WhatsApp.
 */
@Composable
private fun PasoComo(estado: EstadoAsistente, haySesion: Boolean, alCuenta: () -> Unit, viewModel: FormularioReporteViewModel) {
    val d = estado.datos
    AvisoEmergencia()
    OpcionModo(
        titulo = "Anónimo",
        detalle = "No se solicita nombre, teléfono ni correo. Recibirás un folio y una clave para consultar el avance.",
        elegido = !d.vincular,
        alElegir = { viewModel.actualizar(CampoReporte.MODO) { it.copy(vincular = false) } }
    )
    OpcionModo(
        titulo = "Con seguimiento",
        detalle = "Usa tu cuenta opcional (solo correo) para ver el avance en \"Mi panel\". No pedimos teléfono.",
        elegido = d.vincular,
        alElegir = { viewModel.actualizar(CampoReporte.MODO) { it.copy(vincular = true) } }
    )
    if (d.vincular) {
        if (haySesion) {
            NotaCampo("Este reporte se vinculará a tu cuenta. El personal del SIPINNA no ve tu correo.")
        } else {
            NotaCampo("Necesitas iniciar sesión. Lo que captures aquí no se pierde.")
            OutlinedButton(onClick = alCuenta, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text("Iniciar sesión o crear cuenta")
            }
        }
    }
    estado.errores[CampoReporte.MODO]?.let { ErrorCampo(it) }
}

/** Opción de modo de reporte: tarjeta seleccionable con radio, título y detalle. */
@Composable
private fun OpcionModo(titulo: String, detalle: String, elegido: Boolean, alElegir: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = if (elegido) TintePrimario else MaterialTheme.colorScheme.surfaceVariant),
        border = if (elegido) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
        modifier = Modifier.fillMaxWidth().selectable(selected = elegido, role = Role.RadioButton, onClick = alElegir)
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            RadioButton(selected = elegido, onClick = null)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(titulo, style = MaterialTheme.typography.titleMedium)
                Text(detalle, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

// ---------- Paso 3: A quiénes ----------

/** Peligro inmediato, cantidad y edad aproximada (formulario del socio, Fase 6). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PasoQuienes(estado: EstadoAsistente, viewModel: FormularioReporteViewModel) {
    val contexto = LocalContext.current
    val d = estado.datos
    val e = estado.errores

    Seccion("¿La niña, niño o adolescente está en peligro inmediato?")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ValidadorReporte.PELIGRO.forEach { opcion ->
            FilterChip(
                selected = d.peligro == opcion,
                onClick = { viewModel.actualizar(CampoReporte.PELIGRO) { it.copy(peligro = opcion) } },
                label = { Text(opcion) },
                modifier = Modifier.heightIn(min = 48.dp)
            )
        }
    }
    e[CampoReporte.PELIGRO]?.let { ErrorCampo(it) }
    if (d.peligro == "Sí") {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Llama al 911 ahora", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.semantics { heading(); liveRegion = LiveRegionMode.Assertive })
                Text("RIETI no sustituye los servicios de emergencia ni la denuncia formal. Puedes terminar el reporte después de llamar.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
                Button(
                    onClick = { contexto.startActivity(Intent(Intent.ACTION_DIAL, "tel:911".toUri())) },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                ) {
                    Icon(Icons.Filled.Call, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                    Text("Llamar al 911", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }

    Seccion("¿Cuántas niñas, niños o adolescentes viste?")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        ValidadorReporte.CANTIDADES.forEach { opcion ->
            FilterChip(
                selected = d.cantidad == opcion,
                onClick = { viewModel.actualizar(CampoReporte.CANTIDAD, CampoReporte.GRUPOS) { it.copy(cantidad = opcion) } },
                label = { Text(ValidadorReporte.TEXTO_CANTIDAD[opcion] ?: opcion) },
                modifier = Modifier.heightIn(min = 48.dp)
            )
        }
    }
    e[CampoReporte.CANTIDAD]?.let { ErrorCampo(it) }

    Seccion("Edad aproximada")
    NotaCampo("Puedes elegir más de una.")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        ValidadorReporte.EDADES.forEach { rango ->
            val elegida = rango in d.edades
            FilterChip(
                selected = elegida,
                onClick = {
                    viewModel.actualizar(CampoReporte.EDADES, CampoReporte.GRUPOS) {
                        it.copy(edades = if (elegida) it.edades - rango else it.edades + rango)
                    }
                },
                label = { Text(ValidadorReporte.CHIPS_EDAD.getValue(rango)) },
                modifier = Modifier.heightIn(min = 48.dp)
            )
        }
    }
    e[CampoReporte.EDADES]?.let { ErrorCampo(it) }
    if (d.edades.size > 1) {
        Seccion("¿Cuántas en cada edad?")
        ContadorEdades(d.conteos, rangos = ValidadorReporte.EDADES.filter { it in d.edades }) { rango, n ->
            viewModel.actualizar(CampoReporte.GRUPOS) { it.copy(conteos = it.conteos + (rango to n.coerceAtLeast(0))) }
        }
    }
    e[CampoReporte.GRUPOS]?.let { ErrorCampo(it) }
}

// ---------- Paso 3: Qué ocurre ----------

/** Actividad, situación de riesgo y descripción. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PasoQue(estado: EstadoAsistente, viewModel: FormularioReporteViewModel) {
    val actividades by viewModel.actividades.collectAsState()
    val d = estado.datos
    val e = estado.errores

    Seccion("¿Qué actividad realizaban?")
    SelectorActividad(actividades, d.actividad) { a -> viewModel.actualizar(CampoReporte.ACTIVIDAD) { it.copy(actividad = a) } }
    e[CampoReporte.ACTIVIDAD]?.let { ErrorCampo(it) }
    if (d.actividad == ValidadorReporte.ACTIVIDAD_OTRO) {
        CampoTexto("Describe la actividad", d.actividadOtro, ValidadorReporte.MAX_ACTIVIDAD_OTRO, error = e[CampoReporte.ACTIVIDAD_OTRO]) { v ->
            viewModel.actualizar(CampoReporte.ACTIVIDAD_OTRO) { it.copy(actividadOtro = v) }
        }
    }

    Seccion("¿Percibes una situación de riesgo?")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ValidadorReporte.RIESGOS.forEach { opcion ->
            FilterChip(
                selected = d.riesgo == opcion,
                onClick = { viewModel.actualizar(CampoReporte.RIESGO) { it.copy(riesgo = opcion) } },
                label = { Text(opcion) },
                modifier = Modifier.heightIn(min = 48.dp)
            )
        }
    }
    e[CampoReporte.RIESGO]?.let { ErrorCampo(it) }

    Seccion("Describe lo que observaste")
    NotaCampo("No escribas nombres, CURP ni domicilios de las niñas, niños o adolescentes.")
    OutlinedTextField(
        value = d.descripcion,
        onValueChange = { v -> if (v.length <= ValidadorReporte.MAX_DESCRIPCION) viewModel.actualizar(CampoReporte.DESCRIPCION) { it.copy(descripcion = v) } },
        label = { Text("Qué viste, a qué hora, señas del lugar") },
        isError = e[CampoReporte.DESCRIPCION] != null,
        supportingText = { Text(e[CampoReporte.DESCRIPCION] ?: "${d.descripcion.length}/${ValidadorReporte.MAX_DESCRIPCION}") },
        minLines = 4,
        modifier = Modifier.fillMaxWidth()
    )

    SeccionFotos(viewModel)
}

/**
 * Fotos opcionales (Fase 8): primero la advertencia del socio y la casilla de lectura; luego
 * el selector de fotos del sistema (sin permisos de almacenamiento) o la cámara por intent
 * (sin permiso de cámara). Cada foto se reduce y pierde sus metadatos en el teléfono.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SeccionFotos(viewModel: FormularioReporteViewModel) {
    val contexto = LocalContext.current
    val alcance = rememberCoroutineScope()
    val fotos by viewModel.fotos.collectAsState()
    val leida by viewModel.advertenciaLeida.collectAsState()
    var aviso by remember { mutableStateOf<String?>(null) }
    var preparando by remember { mutableStateOf(false) }
    var captura by remember { mutableStateOf<Uri?>(null) }
    val restantes = ReglasFotos.restantes(fotos.size)

    val agregar: (List<Uri>) -> Unit = { uris ->
        if (uris.isNotEmpty()) alcance.launch {
            preparando = true
            aviso = null
            uris.take(ReglasFotos.restantes(viewModel.fotos.value.size)).forEach { uri ->
                val bytes = prepararFoto(contexto, uri)
                if (bytes != null) viewModel.agregarFoto(bytes) else aviso = "Una de las fotos no se pudo leer. Elige otra (JPG, PNG o WebP)."
            }
            preparando = false
        }
    }
    val galeriaVarias = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(ReglasFotos.MAXIMO)) { agregar(it) }
    val galeriaUna = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> agregar(listOfNotNull(uri)) }
    val camara = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = captura
        if (ok && uri != null) {
            alcance.launch {
                preparando = true
                val bytes = prepararFoto(contexto, uri)
                if (bytes != null) viewModel.agregarFoto(bytes) else aviso = "No se pudo usar la foto. Inténtalo de nuevo."
                // La captura original (con sus metadatos) se borra del teléfono en cuanto se preparó.
                contexto.contentResolver.delete(uri, null, null)
                preparando = false
            }
        } else if (uri != null) {
            contexto.contentResolver.delete(uri, null, null)
        }
        captura = null
    }

    Seccion("Fotografía (opcional)")
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Antes de adjuntar", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(ReglasFotos.ADVERTENCIA, style = MaterialTheme.typography.bodyMedium)
        }
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .toggleable(value = leida, role = Role.Checkbox, onValueChange = { viewModel.leerAdvertencia(it) })
    ) {
        Checkbox(checked = leida, onCheckedChange = null)
        Text("Leí la advertencia y quiero adjuntar fotos", modifier = Modifier.padding(start = 8.dp))
    }
    if (leida) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {
                    val solicitud = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    if (restantes > 1) galeriaVarias.launch(solicitud) else galeriaUna.launch(solicitud)
                },
                enabled = restantes > 0 && !preparando,
                modifier = Modifier.heightIn(min = 48.dp)
            ) { Text("Elegir de la galería") }
            OutlinedButton(
                onClick = {
                    val carpeta = File(contexto.cacheDir, "fotos").apply { mkdirs() }
                    val uri = FileProvider.getUriForFile(contexto, "${contexto.packageName}.fotos", File(carpeta, "captura-${UUID.randomUUID()}.jpg"))
                    captura = uri
                    try {
                        camara.launch(uri)
                    } catch (e: ActivityNotFoundException) {
                        captura = null
                        aviso = "No encontramos una app de cámara. Elige la foto de la galería."
                    }
                },
                enabled = restantes > 0 && !preparando,
                modifier = Modifier.heightIn(min = 48.dp)
            ) { Text("Tomar foto") }
        }
        NotaCampo("Hasta ${ReglasFotos.MAXIMO} fotos. Se quita la información del teléfono y de ubicación que traen las fotos.")
        if (preparando) Text("Preparando la foto…", style = MaterialTheme.typography.bodySmall)
        fotos.forEachIndexed { i, foto ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text("Foto ${i + 1} · ${maxOf(1, foto.size / 1024)} KB", modifier = Modifier.weight(1f))
                TextButton(onClick = { viewModel.quitarFoto(i) }, modifier = Modifier.heightIn(min = 48.dp)
                    .semantics { contentDescription = "Quitar la foto ${i + 1}" }) { Text("Quitar") }
            }
        }
        aviso?.let { ErrorCampo(it) }
    }
}

// ---------- Paso 5: Revisar y enviar ----------

/** Resumen de todo lo capturado, con "Editar" por bloque (incluido el modo de reporte). */
@Composable
private fun PasoRevisar(estado: EstadoAsistente, haySesion: Boolean, viewModel: FormularioReporteViewModel) {
    val punto by viewModel.ubicacion.collectAsState()
    val d = estado.datos
    NotaCampo("Revisa que todo esté bien. Al enviar recibirás un folio y una clave para consultar el avance.")

    BloqueRevision("Cómo reportar", alEditar = { viewModel.irA(PasoReporte.COMO) }) {
        Dato("Modo", if (d.vincular && haySesion) "Con seguimiento (vinculado a tu cuenta)" else "Anónimo")
    }
    BloqueRevision("Dónde", alEditar = { viewModel.irA(PasoReporte.DONDE) }) {
        Dato("Municipio", d.municipio?.nombre ?: "—")
        Dato("Dirección", listOf(
            listOf(d.direccion.calle.trim(), d.direccion.numero.trim()).filter { it.isNotEmpty() }.joinToString(" "),
            d.direccion.colonia.trim().takeIf { it.isNotEmpty() }?.let { "Col. $it" },
            d.direccion.codigoPostal.takeIf { it.isNotEmpty() }?.let { "C.P. $it" }
        ).filterNot { it.isNullOrEmpty() }.joinToString(", "))
        d.direccion.referencias.trim().takeIf { it.isNotEmpty() }?.let { Dato("Referencias", it) }
        Dato("Punto en el mapa", if (punto != null) "Marcado" else "Sin punto (opcional)")
    }
    BloqueRevision("A quiénes", alEditar = { viewModel.irA(PasoReporte.QUIENES) }) {
        Dato("¿Peligro inmediato?", d.peligro)
        Dato("¿Cuántas?", ValidadorReporte.TEXTO_CANTIDAD[d.cantidad] ?: d.cantidad)
        Dato("Edad aproximada", ValidadorReporte.EDADES.filter { it in d.edades }.joinToString(", ") { ValidadorReporte.CHIPS_EDAD.getValue(it) })
        if (d.edades.size > 1) {
            val grupos = ValidadorReporte.gruposDesdeFormulario(d.cantidad, d.edades, d.conteos)
            Dato("Por edad", FormatoReporte.menores(grupos, 0, ""))
        }
    }
    BloqueRevision("Qué ocurre", alEditar = { viewModel.irA(PasoReporte.QUE) }) {
        Dato("Actividad", FormatoReporte.actividad(ValidadorReporte.textoActividad(d.actividad), d.actividadOtro.takeIf { d.actividad == ValidadorReporte.ACTIVIDAD_OTRO }))
        Dato("¿Riesgo percibido?", d.riesgo)
        Dato("Descripción", d.descripcion.trim())
        val fotos by viewModel.fotos.collectAsState()
        Dato("Fotos", if (fotos.isEmpty()) "Sin fotos" else "${fotos.size} (se adjuntan al enviar)")
    }

}

/** Tarjeta de un bloque de la revisión con su botón "Editar". */
@Composable
private fun BloqueRevision(titulo: String, alEditar: () -> Unit, contenido: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(titulo, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).semantics { heading() })
                TextButton(onClick = alEditar, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Editar: $titulo" }) {
                    Text("Editar")
                }
            }
            contenido()
        }
    }
}

/** Etiqueta y valor de la revisión. */
@Composable
private fun Dato(etiqueta: String, valor: String) {
    Column(Modifier.semantics(mergeDescendants = true) {}) {
        Text(etiqueta, style = MaterialTheme.typography.labelMedium, color = TextoSecundario)
        Text(valor.ifBlank { "—" }, style = MaterialTheme.typography.bodyLarge)
    }
}

// ---------- Piezas comunes ----------

/** Encabezado de sección dentro de un paso. */
@Composable
private fun Seccion(texto: String) {
    Text(texto, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
}

/** Mensaje de error junto a un campo que no es de texto (contadores, selector, chips). */
@Composable
private fun ErrorCampo(texto: String) {
    Text(
        texto,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
    )
}

/** Campo de texto de una línea con límite de largo y error junto al campo. */
@Composable
private fun CampoTexto(
    etiqueta: String,
    valor: String,
    maximo: Int,
    teclado: KeyboardType = KeyboardType.Text,
    ayuda: String? = null,
    error: String? = null,
    alCambiar: (String) -> Unit
) {
    OutlinedTextField(
        value = valor,
        onValueChange = { if (it.length <= maximo) alCambiar(it) },
        label = { Text(etiqueta) },
        isError = error != null,
        supportingText = (error ?: ayuda)?.let { { Text(it) } },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = teclado),
        modifier = Modifier.fillMaxWidth()
    )
}
