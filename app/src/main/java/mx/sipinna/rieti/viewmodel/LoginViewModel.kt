package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.LoginResponse
import mx.sipinna.rieti.repository.SesionRepositorio

/**
 * ViewModel del inicio de sesión del personal SIPINNA.
 *
 * Llama a `POST /api/v1/auth/login` (Cognito detrás). No hay "Crear cuenta":
 * las cuentas las da de alta un administrador (D-07, D-12).
 *
 * @param sesion repositorio de sesión (sustituible en pruebas)
 */
class LoginViewModel(
    private val sesion: SesionRepositorio = SesionRepositorio()
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<LoginResponse>>(UiState.Inactivo)

    /** Estado del intento de inicio de sesión; en [UiState.Exito] se navega a la bandeja. */
    val estado: StateFlow<UiState<LoginResponse>> = _estado.asStateFlow()

    /** Intenta iniciar sesión con el correo y la contraseña capturados. */
    fun iniciarSesion(correo: String, password: String) {
        if (_estado.value is UiState.Cargando) return
        if (correo.isBlank() || password.isBlank()) {
            _estado.value = UiState.Error("Escribe tu correo y tu contraseña")
            return
        }
        _estado.value = UiState.Cargando
        viewModelScope.launch { _estado.value = sesion.iniciarSesion(correo, password).aUiState() }
    }

    /** Limpia el resultado tras navegar, para no repetir la navegación al recomponer. */
    fun consumirResultado() {
        _estado.value = UiState.Inactivo
    }
}
