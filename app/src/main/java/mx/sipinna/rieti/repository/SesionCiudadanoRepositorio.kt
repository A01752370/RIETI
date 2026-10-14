package mx.sipinna.rieti.repository

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import mx.sipinna.rieti.model.CambiarContrasena
import mx.sipinna.rieti.model.ConfirmarCuenta
import mx.sipinna.rieti.model.CorreoCiudadano
import mx.sipinna.rieti.model.CredencialesCiudadano
import mx.sipinna.rieti.model.CuentaCiudadano
import mx.sipinna.rieti.model.Mensaje
import mx.sipinna.rieti.model.MiReporte
import mx.sipinna.rieti.model.RefrescarSesion
import mx.sipinna.rieti.model.RestablecerContrasena
import mx.sipinna.rieti.network.ApiService
import mx.sipinna.rieti.network.ServicioRemoto

/**
 * Sesión de la cuenta **opcional** de ciudadano (Fase 4, D-19).
 *
 * - El access token vive **solo en memoria** y dura una hora.
 * - El refresh token se guarda **cifrado** con [AlmacenSeguro] (llave del Android
 *   Keystore) para no pedir la contraseña cada vez; nunca se registra en logs.
 * - Ante un 401 se renueva una vez con el refresh token; si eso falla, la
 *   sesión se cierra.
 *
 * Es independiente de la sesión del personal: usan pools y tokens distintos.
 */
object SesionCiudadanoRepositorio {

    private const val CLAVE_REFRESH = "refresh_ciudadano"

    private var almacen: AlmacenSeguro? = null
    private var api: ApiService = ServicioRemoto.api

    @Volatile
    private var accessToken: String? = null

    @Volatile
    private var venceEn: Long = 0L

    private val _haySesion = MutableStateFlow(false)

    /** true si hay una cuenta con la sesión iniciada en este teléfono. */
    val haySesion: StateFlow<Boolean> = _haySesion.asStateFlow()

    /** Se llama una vez al abrir la app; recupera la sesión si había un refresh token guardado. */
    fun iniciar(contexto: Context) {
        if (almacen != null) return
        almacen = AlmacenSeguro(contexto.applicationContext)
        _haySesion.value = almacen?.leer(CLAVE_REFRESH) != null
    }

    /** Solo para pruebas: sustituye el API. */
    internal fun usarApi(nueva: ApiService) {
        api = nueva
    }

    private fun limpiar() {
        accessToken = null
        venceEn = 0L
        almacen?.guardar(CLAVE_REFRESH, null)
        _haySesion.value = false
    }

    /** Access token vigente; lo renueva con el refresh token si hace falta. */
    suspend fun tokenVigente(): String? {
        val actual = accessToken
        if (actual != null && System.currentTimeMillis() < venceEn) return actual
        val refresh = almacen?.leer(CLAVE_REFRESH) ?: return null
        return when (val r = ejecutar { api.refrescarCiudadano(RefrescarSesion(refresh)) }) {
            is Resultado.Exito -> {
                accessToken = r.datos.accessToken
                venceEn = System.currentTimeMillis() + (r.datos.expiresIn - 60) * 1000L
                r.datos.accessToken
            }
            is Resultado.Error -> {
                if (r.estatusHttp == 401) limpiar()
                null
            }
        }
    }

    /** Ejecuta una llamada con el token; ante 401 renueva una vez y reintenta. */
    private suspend fun <T> conSesion(llamada: suspend (String) -> T): Resultado<T> {
        val token = tokenVigente() ?: return Resultado.Error("SESION_EXPIRADA", MensajesError.SESION_EXPIRADA, 401)
        val r = ejecutar { llamada("Bearer $token") }
        if (r is Resultado.Error && r.estatusHttp == 401) {
            accessToken = null
            val nuevo = tokenVigente() ?: return r
            return ejecutar { llamada("Bearer $nuevo") }
        }
        return r
    }

    suspend fun registrar(correo: String, password: String): Resultado<Mensaje> =
        ejecutar { api.registrarCiudadano(CredencialesCiudadano(correo.trim(), password)) }

    suspend fun confirmar(correo: String, codigo: String): Resultado<Mensaje> =
        ejecutar { api.confirmarCiudadano(ConfirmarCuenta(correo.trim(), codigo.trim())) }

    suspend fun reenviarCodigo(correo: String): Resultado<Mensaje> = ejecutar { api.reenviarCodigo(CorreoCiudadano(correo.trim())) }

    /** Inicia sesión y guarda el refresh token cifrado. */
    suspend fun iniciarSesion(correo: String, password: String): Resultado<Unit> {
        return when (val r = ejecutar { api.loginCiudadano(CredencialesCiudadano(correo.trim(), password)) }) {
            is Resultado.Exito -> {
                accessToken = r.datos.accessToken
                venceEn = System.currentTimeMillis() + (r.datos.expiresIn - 60) * 1000L
                almacen?.guardar(CLAVE_REFRESH, r.datos.refreshToken)
                _haySesion.value = true
                Resultado.Exito(Unit)
            }
            is Resultado.Error -> r
        }
    }

    suspend fun olvideContrasena(correo: String): Resultado<Mensaje> = ejecutar { api.olvideContrasena(CorreoCiudadano(correo.trim())) }

    suspend fun restablecer(correo: String, codigo: String, password: String): Resultado<Mensaje> =
        ejecutar { api.restablecerContrasena(RestablecerContrasena(correo.trim(), codigo.trim(), password)) }

    suspend fun cuenta(): Resultado<CuentaCiudadano> = conSesion { api.cuentaCiudadano(it) }

    suspend fun misReportes(): Resultado<List<MiReporte>> = conSesion { api.misReportes(it) }

    suspend fun cambiarContrasena(actual: String, nueva: String): Resultado<Mensaje> =
        conSesion { api.cambiarContrasena(it, CambiarContrasena(actual, nueva)) }

    /** Cierra sesión en todos los dispositivos; aunque el servidor falle, se borra la sesión local. */
    suspend fun cerrarSesion(): Resultado<Unit> {
        conSesion { api.cerrarSesionCiudadano(it) }
        limpiar()
        return Resultado.Exito(Unit)
    }

    /** Elimina la cuenta; si sale bien, borra la sesión local. */
    suspend fun eliminarCuenta(): Resultado<Mensaje> {
        val r = conSesion { api.eliminarCuenta(it) }
        if (r is Resultado.Exito) limpiar()
        return r
    }
}
