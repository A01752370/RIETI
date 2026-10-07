package mx.sipinna.rieti.model

/**
 * Respuesta del backend al iniciar sesión.
 *
 * Nota de autenticación (ver arquitectura móvil): en esta etapa el backend
 * identifica el rol del usuario de forma simplificada; queda pendiente para
 * una siguiente iteración reemplazar esto por JWT + RBAC real (RNF-18).
 *
 * @property idUsuario identificador del usuario autenticado
 * @property correo correo con el que inició sesión
 * @property rol nombre del rol asignado (p. ej. "Ciudadano", "Administrador")
 * @property esAdministrador true si el rol tiene permisos de personal SIPINNA
 */
data class LoginResponse(
    val idUsuario: Int,
    val correo: String,
    val rol: String,
    val esAdministrador: Boolean
)
