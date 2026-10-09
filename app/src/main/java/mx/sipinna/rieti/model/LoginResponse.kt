package mx.sipinna.rieti.model

/**
 * Respuesta del backend al iniciar sesión.
 *
 * El backend autentica contra Amazon Cognito y aplica RBAC por grupos (RNF-18):
 * `accessToken` se envía como `Authorization: Bearer` en las rutas de personal.
 *
 * @property idUsuario identificador del usuario autenticado
 * @property correo correo con el que inició sesión
 * @property rol nombre del rol asignado (p. ej. "Personal SIPINNA", "Administrador")
 * @property esAdministrador true si el rol tiene permisos de personal SIPINNA
 * @property accessToken JWT de Cognito para las peticiones autenticadas
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
