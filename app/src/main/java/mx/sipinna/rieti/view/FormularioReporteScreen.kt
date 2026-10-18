package mx.sipinna.rieti.view

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
import androidx.compose.foundation.selection.toggleable
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
import androidx.compose.material3.Switch
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
 * @param alEnviar navega a la confirmación con el folio y la clave
 * @param alRegresar vuelve al aviso
 */
@Composable
fun FormularioReporteScreen(
    avisoVersion: String,
    alEnviar: (ReporteCreado) -> Unit,
    alRegresar: () -> Unit,
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
            alEnviar(e.datos)
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
                    else viewModel.avanzar()
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
            if (estado.paso != PasoReporte.DONDE) {
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

    AvisoEmergencia()
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

// ---------- Paso 2: A quiénes ----------

/** Menores por grupo de edad. */
@Composable
private fun PasoQuienes(estado: EstadoAsistente, viewModel: FormularioReporteViewModel) {
    NotaCampo("Suma uno por cada niña, niño o adolescente en su grupo de edad. Si no estás seguro de la edad, usa la última opción.")
    ContadorEdades(estado.datos.conteos) { rango, n ->
        viewModel.actualizar(CampoReporte.GRUPOS) { it.copy(conteos = it.conteos + (rango to n.coerceAtLeast(0))) }
    }
    estado.errores[CampoReporte.GRUPOS]?.let { ErrorCampo(it) }
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
}

// ---------- Paso 4: Revisar y enviar ----------

/** Resumen de todo lo capturado, con "Editar" por bloque, y el interruptor de vincular (si hay sesión). */
@Composable
private fun PasoRevisar(estado: EstadoAsistente, haySesion: Boolean, viewModel: FormularioReporteViewModel) {
    val punto by viewModel.ubicacion.collectAsState()
    val d = estado.datos
    NotaCampo("Revisa que todo esté bien. Al enviar recibirás un folio y una clave para consultar el avance.")

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
        val grupos = ValidadorReporte.gruposParaEnviar(d.conteos)
        Dato("Menores", if (grupos.isEmpty()) "—" else FormatoReporte.menores(grupos, 0, ""))
    }
    BloqueRevision("Qué ocurre", alEditar = { viewModel.irA(PasoReporte.QUE) }) {
        Dato("Actividad", FormatoReporte.actividad(d.actividad, d.actividadOtro.takeIf { d.actividad == ValidadorReporte.ACTIVIDAD_OTRO }))
        Dato("¿Riesgo percibido?", d.riesgo)
        Dato("Descripción", d.descripcion.trim())
    }

    if (haySesion) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .toggleable(value = d.vincular, role = Role.Switch, onValueChange = { v -> viewModel.actualizar { it.copy(vincular = v) } })
        ) {
            Column(Modifier.weight(1f)) {
                Text("Vincular este reporte a mi cuenta", style = MaterialTheme.typography.bodyLarge)
                NotaCampo("Así lo verás en \"Mi panel\". Si lo dejas apagado, el reporte es anónimo.")
            }
            Switch(checked = d.vincular, onCheckedChange = null)
        }
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
