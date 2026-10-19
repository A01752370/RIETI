package mx.sipinna.rieti.repository

import mx.sipinna.rieti.model.LoginRequest
import mx.sipinna.rieti.model.LoginResponse
import mx.sipinna.rieti.network.ApiService
import mx.sipinna.rieti.network.ServicioRemoto

/**
 * Sesión del personal SIPINNA.
 *
 * El backend autentica contra Amazon Cognito (`POST /api/v1/auth/login`) y
 * devuelve un access token. Aquí se guarda **solo en memoria** (en
 * [ServicioRemoto.accessToken]); nunca en disco.
 *
 * @param api implementación del API (por defecto, la de [ServicioRemoto])
 */
class SesionRepositorio(private val api: ApiService = ServicioRemoto.api) {

    /** Inicia sesión y, si sale bien, deja el token listo para las siguientes peticiones. */
    suspend fun iniciarSesion(correo: String, password: String): Resultado<LoginResponse> {
        val r = ejecutar { api.login(LoginRequest(correo.trim(), password)) }
        if (r is Resultado.Exito) {
            ServicioRemoto.accessToken = r.datos.accessToken
            ServicioRemoto.correoPersonal = r.datos.correo
        }
        return r
    }

    /** Descarta el token de la sesión actual. */
    fun cerrarSesion() {
        ServicioRemoto.accessToken = null
        ServicioRemoto.correoPersonal = null
    }

    /** Correo de la sesión (en memoria), para "Asignarme" (Fase 7). */
    fun correo(): String? = ServicioRemoto.correoPersonal

    /** true si hay un token en memoria (puede estar vencido; el servidor decide). */
    fun haySesion(): Boolean = ServicioRemoto.accessToken != null
}
