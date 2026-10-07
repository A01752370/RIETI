package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import mx.sipinna.rieti.viewmodel.LoginViewModel

/**
 * Pantalla de inicio de sesión (personal SIPINNA/administración).
 *
 * Toda la lógica de red vive en [LoginViewModel]; esta pantalla solo lee los
 * campos capturados, llama al ViewModel, y observa sus `StateFlow` con
 * `collectAsState()` para reaccionar (navegar, mostrar error, mostrar loader).
 */
@Composable
fun LoginScreen(navController: NavHostController, viewModel: LoginViewModel = viewModel()) {
    var correo by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    val cargando by viewModel.cargando.collectAsState()
    val error by viewModel.error.collectAsState()
    val esAdmin by viewModel.esAdmin.collectAsState()

    // Cuando el login resulta exitoso, navega a Home y limpia el resultado
    // para que no se vuelva a disparar la navegación al recomponer.
    if (esAdmin != null) {
        navController.navigate(Rutas.home(esAdmin!!))
        viewModel.limpiarResultado()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("Iniciar sesión", style = MaterialTheme.typography.headlineSmall)

        OutlinedTextField(
            value = correo,
            onValueChange = { correo = it },
            label = { Text("Correo") },
            modifier = Modifier.fillMaxWidth().padding(top = 24.dp)
        )

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Contraseña") },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
        )

        if (error != null) {
            Text(
                text = error ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        Button(
            onClick = { viewModel.login(correo, password) },
            enabled = !cargando,
            modifier = Modifier.fillMaxWidth().padding(top = 20.dp)
        ) {
            Text(if (cargando) "Ingresando..." else "Ingresar")
        }

        TextButton(
            onClick = { navController.navigate(Rutas.REGISTRO) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Crear cuenta")
        }

        TextButton(
            onClick = { navController.navigate(Rutas.FORMULARIO) },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Continuar como ciudadano")
        }
    }
}
