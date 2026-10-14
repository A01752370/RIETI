package mx.sipinna.rieti.model

/** Correo y contraseña para registro o inicio de sesión de ciudadano. */
data class CredencialesCiudadano(val correo: String, val password: String)

/** Solo el correo (reenviar código, olvidé mi contraseña). */
data class CorreoCiudadano(val correo: String)

/** Activación de la cuenta con el código de 6 dígitos. */
data class ConfirmarCuenta(val correo: String, val codigo: String)

/** Restablecer contraseña con el código enviado al correo. */
data class RestablecerContrasena(val correo: String, val codigo: String, val password: String)

/** Renovar la sesión. */
data class RefrescarSesion(val refreshToken: String)

/** Cambio de contraseña con la sesión abierta. */
data class CambiarContrasena(val actual: String, val nueva: String)

/** Respuesta con un mensaje para mostrar. */
data class Mensaje(val mensaje: String)

/**
 * Sesión de ciudadano devuelta por el API.
 *
 * @property refreshToken solo al iniciar sesión; se guarda cifrado en el teléfono
 */
data class SesionCiudadano(val accessToken: String, val refreshToken: String?, val expiresIn: Int)

/**
 * Perfil de la cuenta. El correo lo lee el servidor del servicio de identidad;
 * RIETI no lo guarda en su base de datos.
 */
data class CuentaCiudadano(val correo: String, val fechaCreacion: String, val reportesVinculados: Int)

/** Reporte vinculado a la cuenta (lo mismo que muestra la consulta pública). */
data class MiReporte(
    val folio: String,
    val estatus: String,
    val municipio: String?,
    val actividad: String,
    val fechaCreacion: String,
    val fechaActualizacion: String,
    val historial: List<EventoPublico>
)
