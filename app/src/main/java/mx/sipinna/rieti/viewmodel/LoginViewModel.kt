package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.LoginRequest
import mx.sipinna.rieti.network.ServicioRemoto

/**
 * ViewModel de la pantalla de inicio de sesión.
 *
 * Llama a `POST /auth/login` a través de [ServicioRemoto] y expone el
 * resultado como [StateFlow], que la pantalla Composable observa con
 * `collectAsState()`.
 */
class LoginViewModel : ViewModel() {

    private val _cargando = MutableStateFlow(false)
    val cargando: StateFlow<Boolean> = _cargando

    private val _esAdmin = MutableStateFlow<Boolean?>(null)
    val esAdmin: StateFlow<Boolean?> = _esAdmin

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    /** Intenta iniciar sesión contra el backend con el correo y contraseña capturados. */
    fun login(correo: String, password: String) {
        if (correo.isBlank() || password.isBlank()) {
            _error.value = "Ingresa tu correo y contraseña"
            return
        }
        _cargando.value = true
        viewModelScope.launch {
            val respuesta = ServicioRemoto.login(LoginRequest(correo, password))
            if (respuesta != null) {
                _esAdmin.value = respuesta.esAdministrador
                _error.value = null
            } else {
                _error.value = "No se pudo iniciar sesión. Verifica tu conexión."
            }
            _cargando.value = false
        }
    }

    /** Limpia el resultado de navegación para que no se repita al recomponer. */
    fun limpiarResultado() {
        _esAdmin.value = null
    }
}
