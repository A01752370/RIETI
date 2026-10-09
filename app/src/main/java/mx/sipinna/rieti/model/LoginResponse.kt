package mx.sipinna.rieti.model

/**
 * Respuesta de `POST /api/v1/auth/login`.
 *
 * El backend autentica contra Amazon Cognito y aplica RBAC por grupos (RNF-18).
 * Solo las cuentas de personal SIPINNA pueden iniciar sesión; los ciudadanos
 * reportan sin cuenta (D-12).
 *
 * @property idUsuario identificador del usuario en la base de datos
 * @property correo correo con el que inició sesión
 * @property rol nombre del rol (p. ej. "Personal SIPINNA", "Administrador")
 * @property esAdministrador true si pertenece al grupo Administrador
 * @property accessToken JWT de Cognito para `Authorization: Bearer`
 * @property expiresIn segundos de validez del token
 */
data class LoginResponse(
    val idUsuario: Int,
    val correo: String,
    val rol: String,
    val esAdministrador: Boolean,
    val accessToken: String,
    val expiresIn: Int
)
