package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.model.MiReporte
import mx.sipinna.rieti.ui.theme.TextoSecundario
import mx.sipinna.rieti.viewmodel.AccesoCuentaViewModel
import mx.sipinna.rieti.viewmodel.ConfiguracionCuentaViewModel
import mx.sipinna.rieti.viewmodel.MiPanelViewModel
import mx.sipinna.rieti.viewmodel.UiState
import mx.sipinna.rieti.viewmodel.ValidadorCuenta

/** Pasos del acceso a la cuenta. */
private enum class PasoCuenta { ENTRAR, CREAR, CONFIRMAR, OLVIDE, RESTABLECER }

/**
 * Acceso a la cuenta **opcional** de ciudadano (Fase 4). Recuerda que no hace
 * falta una cuenta para reportar ni consultar.
 *
 * @param alEntrar abre "Mi panel" cuando la sesión se inició
 * @param alRegresar vuelve al inicio
 */
@Composable
fun AccesoCuentaScreen(alEntrar: () -> Unit, alRegresar: () -> Unit, viewModel: AccesoCuentaViewModel = viewModel()) {
    var paso by rememberSaveable { mutableStateOf(PasoCuenta.ENTRAR) }
    var correo by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmacion by rememberSaveable { mutableStateOf("") }
    var codigo by rememberSaveable { mutableStateOf("") }
    val estado by viewModel.estado.collectAsState()

    LaunchedEffect(estado) {
        val e = estado as? UiState.Exito ?: return@LaunchedEffect
        when {
            e.datos == "SESION_INICIADA" -> { password = ""; alEntrar() }
            paso == PasoCuenta.CREAR -> { paso = PasoCuenta.CONFIRMAR; password = ""; confirmacion = "" }
            paso == PasoCuenta.OLVIDE -> paso = PasoCuenta.RESTABLECER
            paso == PasoCuenta.CONFIRMAR || paso == PasoCuenta.RESTABLECER -> { paso = PasoCuenta.ENTRAR; codigo = ""; password = "" }
        }
    }
    fun ir(nuevo: PasoCuenta) { paso = nuevo; viewModel.reiniciar() }

    PantallaRieti(titulo = "Mi cuenta", alRegresar = alRegresar) {
        Text(
            "La cuenta es opcional: puedes reportar y consultar sin ella. Con una cuenta puedes ver tus reportes en \"Mi panel\".",
            style = MaterialTheme.typography.bodyMedium
        )
        if (paso == PasoCuenta.ENTRAR || paso == PasoCuenta.CREAR) {
            TabRow(selectedTabIndex = if (paso == PasoCuenta.ENTRAR) 0 else 1) {
                Tab(selected = paso == PasoCuenta.ENTRAR, onClick = { ir(PasoCuenta.ENTRAR) }, text = { Text("Iniciar sesión") }, modifier = Modifier.heightIn(min = 48.dp))
                Tab(selected = paso == PasoCuenta.CREAR, onClick = { ir(PasoCuenta.CREAR) }, text = { Text("Crear cuenta") }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }

        // El mensaje de éxito de un paso se muestra en el siguiente (p. ej. "te enviamos un código").
        val aviso = (estado as? UiState.Exito)?.datos?.takeIf { it != "SESION_INICIADA" }
        aviso?.let { AvisoCuenta(it) }

        CampoCorreo(correo) { correo = it }
        when (paso) {
            PasoCuenta.ENTRAR -> {
                CampoContrasena("Contraseña", password) { password = it }
                BotonPrincipal("Iniciar sesión", estado is UiState.Cargando) { viewModel.iniciarSesion(correo, password) }
                TextButton(onClick = { ir(PasoCuenta.OLVIDE) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Olvidé mi contraseña") }
                TextButton(onClick = { ir(PasoCuenta.CONFIRMAR) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Tengo un código para activar mi cuenta") }
            }
            PasoCuenta.CREAR -> {
                CampoContrasena("Contraseña", password) { password = it }
                NotaCampo("Al menos ${ValidadorCuenta.MIN_CONTRASENA} caracteres, con mayúsculas, minúsculas y números.")
                CampoContrasena("Repite la contraseña", confirmacion) { confirmacion = it }
                BotonPrincipal("Crear cuenta", estado is UiState.Cargando) { viewModel.registrar(correo, password, confirmacion) }
            }
            PasoCuenta.CONFIRMAR -> {
                Text("Activa tu cuenta", style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                CampoCodigo(codigo) { codigo = it }
                BotonPrincipal("Activar cuenta", estado is UiState.Cargando) { viewModel.confirmar(correo, codigo) }
                TextButton(onClick = { viewModel.reenviarCodigo(correo) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Reenviar código") }
                TextButton(onClick = { ir(PasoCuenta.ENTRAR) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Volver") }
            }
            PasoCuenta.OLVIDE -> {
                Text("Recupera tu contraseña", style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                BotonPrincipal("Enviarme un código", estado is UiState.Cargando) { viewModel.olvideContrasena(correo) }
                TextButton(onClick = { ir(PasoCuenta.ENTRAR) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Volver") }
            }
            PasoCuenta.RESTABLECER -> {
                Text("Nueva contraseña", style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                CampoCodigo(codigo) { codigo = it }
                CampoContrasena("Nueva contraseña", password) { password = it }
                BotonPrincipal("Cambiar contraseña", estado is UiState.Cargando) { viewModel.restablecer(correo, codigo, password) }
                TextButton(onClick = { ir(PasoCuenta.ENTRAR) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Volver") }
            }
        }
        (estado as? UiState.Error)?.let { MensajeError(it.mensaje) }
        if (estado is UiState.Cargando) Cargando()
    }
}

/**
 * "Mi panel": reportes vinculados a la cuenta, con su estatus e historial
 * público (sin notas del personal).
 *
 * @param alConfiguracion abre la configuración de la cuenta
 * @param alRegresar vuelve al inicio
 * @param alSesionExpirada la sesión ya no es válida: hay que volver a entrar
 */
@Composable
fun MiPanelScreen(
    alConfiguracion: () -> Unit,
    alRegresar: () -> Unit,
    alSesionExpirada: () -> Unit,
    viewModel: MiPanelViewModel = viewModel()
) {
    val estado by viewModel.reportes.collectAsState()
    LaunchedEffect(Unit) { viewModel.cargar() }
    LaunchedEffect(estado) { if ((estado as? UiState.Error)?.codigo == "SESION_EXPIRADA") alSesionExpirada() }

    PantallaRieti(titulo = "Mi panel", alRegresar = alRegresar, acciones = { AccionBarra("Cuenta", alConfiguracion) }) {
        Text("Reportes que vinculaste a tu cuenta.", style = MaterialTheme.typography.bodyMedium)
        when (val e = estado) {
            is UiState.Inactivo, is UiState.Cargando -> Cargando()
            is UiState.Error -> {
                MensajeError(e.mensaje)
                OutlinedButton(onClick = viewModel::cargar, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Reintentar") }
            }
            is UiState.Exito -> if (e.datos.isEmpty()) {
                EstadoVacio("Aún no tienes reportes vinculados. Al reportar con tu sesión iniciada, activa \"Vincular este reporte a mi cuenta\".")
            } else {
                e.datos.forEach { TarjetaMiReporte(it) }
            }
        }
    }
}

/** Tarjeta de un reporte propio. */
@Composable
private fun TarjetaMiReporte(r: MiReporte) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(r.folio, style = MaterialTheme.typography.titleSmall, fontFamily = FontFamily.Monospace)
                EtiquetaEstatus(r.estatus)
            }
            Text("${r.actividad} · ${r.municipio ?: "Municipio no indicado"}", style = MaterialTheme.typography.bodyMedium)
            Text("Enviado el ${formatearFecha(r.fechaCreacion)}", style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
            r.historial.forEach { ev -> Text("• ${ev.estatus} — ${formatearFecha(ev.fecha)}", style = MaterialTheme.typography.bodySmall) }
        }
    }
}

/**
 * Configuración de la cuenta: perfil, cambiar contraseña, cerrar sesión y
 * eliminar la cuenta (los reportes se conservan para su atención, sin vínculo).
 *
 * @param alRegresar vuelve a "Mi panel"
 * @param alSalir la sesión se cerró o la cuenta se eliminó: vuelve al inicio
 */
@Composable
fun ConfiguracionCuentaScreen(alRegresar: () -> Unit, alSalir: () -> Unit, viewModel: ConfiguracionCuentaViewModel = viewModel()) {
    val cuenta by viewModel.cuenta.collectAsState()
    val accion by viewModel.accion.collectAsState()
    var actual by rememberSaveable { mutableStateOf("") }
    var nueva by rememberSaveable { mutableStateOf("") }
    var confirmarEliminar by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.cargar() }
    LaunchedEffect(accion) {
        val d = (accion as? UiState.Exito)?.datos ?: return@LaunchedEffect
        if (d == "SESION_CERRADA" || d == "CUENTA_ELIMINADA") alSalir() else { actual = ""; nueva = "" }
    }

    PantallaRieti(titulo = "Configuración de cuenta", alRegresar = alRegresar) {
        when (val c = cuenta) {
            is UiState.Exito -> Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(c.datos.correo, style = MaterialTheme.typography.titleMedium)
                    Text("Cuenta creada el ${formatearFecha(c.datos.fechaCreacion)}", style = MaterialTheme.typography.bodySmall)
                    Text("${c.datos.reportesVinculados} reporte(s) vinculado(s)", style = MaterialTheme.typography.bodySmall)
                }
            }
            is UiState.Error -> MensajeError(c.mensaje)
            else -> Cargando()
        }

        Text("Cambiar contraseña", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
        CampoContrasena("Contraseña actual", actual) { actual = it }
        CampoContrasena("Contraseña nueva", nueva) { nueva = it }
        OutlinedButton(onClick = { viewModel.cambiarContrasena(actual, nueva) }, enabled = accion !is UiState.Cargando,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Guardar contraseña") }

        (accion as? UiState.Exito)?.datos?.takeIf { it != "SESION_CERRADA" && it != "CUENTA_ELIMINADA" }?.let { AvisoCuenta(it) }
        (accion as? UiState.Error)?.let { MensajeError(it.mensaje) }

        Text("Sesión", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
        OutlinedButton(onClick = viewModel::cerrarSesion, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Cerrar sesión en todos mis dispositivos") }

        Text("Eliminar cuenta", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
        Text(
            "Se borra tu cuenta. Tus reportes se conservan para que el SIPINNA los atienda, ya sin ningún vínculo contigo.",
            style = MaterialTheme.typography.bodyMedium
        )
        Button(
            onClick = { confirmarEliminar = true },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
        ) { Text("Eliminar mi cuenta") }
    }

    if (confirmarEliminar) {
        AlertDialog(
            onDismissRequest = { confirmarEliminar = false },
            title = { Text("¿Eliminar tu cuenta?") },
            text = { Text("Esta acción no se puede deshacer. Tus reportes se conservan sin vínculo contigo.") },
            confirmButton = { TextButton(onClick = { confirmarEliminar = false; viewModel.eliminarCuenta() }) { Text("Eliminar") } },
            dismissButton = { TextButton(onClick = { confirmarEliminar = false }) { Text("Cancelar") } }
        )
    }
}

@Composable
private fun AvisoCuenta(texto: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), modifier = Modifier.fillMaxWidth()) {
        Text(texto, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
    }
}

@Composable
private fun CampoCorreo(valor: String, alCambiar: (String) -> Unit) {
    OutlinedTextField(
        value = valor, onValueChange = { if (it.length <= 254) alCambiar(it) }, label = { Text("Correo") }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun CampoContrasena(etiqueta: String, valor: String, alCambiar: (String) -> Unit) {
    OutlinedTextField(
        value = valor, onValueChange = { if (it.length <= 256) alCambiar(it) }, label = { Text(etiqueta) }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun CampoCodigo(valor: String, alCambiar: (String) -> Unit) {
    OutlinedTextField(
        value = valor, onValueChange = { alCambiar(it.filter(Char::isDigit).take(6)) }, label = { Text("Código de 6 dígitos") },
        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun BotonPrincipal(texto: String, cargando: Boolean, alPresionar: () -> Unit) {
    Button(onClick = alPresionar, enabled = !cargando, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(texto) }
}
