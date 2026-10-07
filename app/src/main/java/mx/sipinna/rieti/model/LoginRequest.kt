package mx.sipinna.rieti.model

/**
 * Cuerpo de la petición de inicio de sesión.
 *
 * @property correo correo electrónico capturado en la pantalla de login
 * @property password contraseña capturada en el formulario de acceso
 */
data class LoginRequest(
    val correo: String,
    val password: String
)
