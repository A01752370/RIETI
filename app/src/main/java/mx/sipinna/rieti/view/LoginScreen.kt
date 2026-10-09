package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.sipinna.rieti.viewmodel.LoginViewModel
import mx.sipinna.rieti.viewmodel.UiState

/**
 * Inicio de sesión del personal SIPINNA.
 *
 * No existe "Crear cuenta": los ciudadanos no necesitan cuenta (D-12) y las
 * cuentas del personal las crea un administrador (D-07).
 *
 * @param alIniciarSesion navega a la bandeja
 * @param alRegresar vuelve al inicio
 */
@Composable
fun LoginScreen(alIniciarSesion: () -> Unit, alRegresar: () -> Unit, viewModel: LoginViewModel = viewModel()) {
    var correo by rememberSaveable { mutableStateOf("") }
    // La contraseña no se guarda en el estado restaurable (no sobrevive a la recreación del proceso).
    var password by remember { mutableStateOf("") }
    val estado by viewModel.estado.collectAsState()

    LaunchedEffect(estado) {
        if (estado is UiState.Exito) {
            password = ""
            viewModel.consumirResultado()
            alIniciarSesion()
        }
    }

    PantallaRieti(titulo = "Personal SIPINNA", alRegresar = alRegresar) {
        Text("Inicia sesión con la cuenta que te asignó la administración.", style = MaterialTheme.typography.bodyLarge)
        OutlinedTextField(
            value = correo,
            onValueChange = { correo = it },
            label = { Text("Correo") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Contraseña") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth()
        )

        (estado as? UiState.Error)?.let { MensajeError(it.mensaje) }

        Button(
            onClick = { viewModel.iniciarSesion(correo, password) },
            enabled = estado !is UiState.Cargando,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
        ) {
            Text(if (estado is UiState.Cargando) "Ingresando…" else "Ingresar")
        }
    }
}
