package mx.sipinna.rieti.network

import mx.sipinna.rieti.model.Actividad
import mx.sipinna.rieti.model.AgregarSeguimientoRequest
import mx.sipinna.rieti.model.AvisoPrivacidad
import mx.sipinna.rieti.model.CambiarEstatusRequest
import mx.sipinna.rieti.model.ConsultaPublica
import mx.sipinna.rieti.model.ConsultaRequest
import mx.sipinna.rieti.model.ConfirmarFotosRequest
import mx.sipinna.rieti.model.Embudo
import mx.sipinna.rieti.model.FotoPersonal
import mx.sipinna.rieti.model.FotosConfirmadas
import mx.sipinna.rieti.model.SolicitarFotosRequest
import mx.sipinna.rieti.model.SolicitudFotos
import mx.sipinna.rieti.model.Responsable
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.GeoReversa
import mx.sipinna.rieti.model.LoginRequest
import mx.sipinna.rieti.model.LoginResponse
import mx.sipinna.rieti.model.Municipio
import mx.sipinna.rieti.model.Pagina
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.model.ReporteDetalle
import mx.sipinna.rieti.model.ReporteResumen
import mx.sipinna.rieti.model.ResumenPersonal
import mx.sipinna.rieti.model.SinAtender
import mx.sipinna.rieti.model.CambiarContrasena
import mx.sipinna.rieti.model.ConfirmarCuenta
import mx.sipinna.rieti.model.CorreoCiudadano
import mx.sipinna.rieti.model.CredencialesCiudadano
import mx.sipinna.rieti.model.CuentaCiudadano
import mx.sipinna.rieti.model.Mensaje
import mx.sipinna.rieti.model.MiReporte
import mx.sipinna.rieti.model.RefrescarSesion
import mx.sipinna.rieti.model.RestablecerContrasena
import mx.sipinna.rieti.model.SesionCiudadano
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.Header
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Contrato del API REST v1 del backend (NestJS), relativo a `BuildConfig.API_URL`.
 *
 * Es el punto de acoplamiento con el backend: cualquier cambio de ruta o de la
 * forma del JSON debe reflejarse también en `docs/api/openapi.json`.
 *
 * Las rutas públicas no llevan token; las del personal lo reciben del
 * interceptor de [ServicioRemoto]. Las funciones lanzan excepción ante error:
 * el manejo está centralizado en `repository/`.
 */
interface ApiService {

    /** Aviso de privacidad vigente (público, CU-02). */
    @GET("api/v1/avisos-privacidad/vigente")
    suspend fun avisoPrivacidad(): AvisoPrivacidad

    /** D-16: los 125 municipios del Estado de México, en orden alfabético (público). */
    @GET("api/v1/catalogos/municipios")
    suspend fun municipios(): List<Municipio>

    /** Catálogo de actividades en el orden del selector, "Otro" al final (público). */
    @GET("api/v1/catalogos/actividades")
    suspend fun actividades(): List<Actividad>

    /**
     * Dirección sugerida y municipio de un punto del mapa (público). El servidor
     * consulta al proveedor del mapa; la app nunca llama directo a terceros.
     */
    @GET("api/v1/geo/reversa")
    suspend fun reversa(@Query("lat") lat: Double, @Query("lng") lng: Double): GeoReversa

    /**
     * CU-04: registra un reporte; devuelve folio y clave (público). Con el token de
     * ciudadano y `vincularCuenta = true` queda ligado a la cuenta (Fase 4).
     */
    @POST("api/v1/reportes")
    suspend fun crearReporte(@Body request: CrearReporteRequest, @Header("Authorization") ciudadano: String? = null): ReporteCreado

    // --- Cuentas opcionales de ciudadano (Fase 4) ---

    /** Crea una cuenta (respuesta igual exista o no el correo). */
    @POST("api/v1/ciudadanos/registro")
    suspend fun registrarCiudadano(@Body r: CredencialesCiudadano): Mensaje

    /** Activa la cuenta con el código del correo. */
    @POST("api/v1/ciudadanos/confirmar")
    suspend fun confirmarCiudadano(@Body r: ConfirmarCuenta): Mensaje

    /** Reenvía el código de activación. */
    @POST("api/v1/ciudadanos/reenviar-codigo")
    suspend fun reenviarCodigo(@Body r: CorreoCiudadano): Mensaje

    /** Inicia sesión de ciudadano. */
    @POST("api/v1/ciudadanos/login")
    suspend fun loginCiudadano(@Body r: CredencialesCiudadano): SesionCiudadano

    /** Renueva el access token. */
    @POST("api/v1/ciudadanos/refresh")
    suspend fun refrescarCiudadano(@Body r: RefrescarSesion): SesionCiudadano

    /** Pide un código para restablecer la contraseña. */
    @POST("api/v1/ciudadanos/olvide-contrasena")
    suspend fun olvideContrasena(@Body r: CorreoCiudadano): Mensaje

    /** Restablece la contraseña con el código. */
    @POST("api/v1/ciudadanos/restablecer-contrasena")
    suspend fun restablecerContrasena(@Body r: RestablecerContrasena): Mensaje

    /** Perfil de la cuenta. */
    @GET("api/v1/ciudadano/cuenta")
    suspend fun cuentaCiudadano(@Header("Authorization") token: String): CuentaCiudadano

    /** Cambia la contraseña. */
    @POST("api/v1/ciudadano/cuenta/contrasena")
    suspend fun cambiarContrasena(@Header("Authorization") token: String, @Body r: CambiarContrasena): Mensaje

    /** Cierra la sesión en todos los dispositivos. */
    @POST("api/v1/ciudadano/cuenta/cerrar-sesion")
    suspend fun cerrarSesionCiudadano(@Header("Authorization") token: String): Mensaje

    /** Elimina la cuenta (los reportes se conservan sin vínculo). */
    @DELETE("api/v1/ciudadano/cuenta")
    suspend fun eliminarCuenta(@Header("Authorization") token: String): Mensaje

    /** Reportes vinculados a la cuenta. */
    @GET("api/v1/ciudadano/reportes")
    suspend fun misReportes(@Header("Authorization") token: String): List<MiReporte>

    /** CU-08: consulta ciudadana con folio + clave (público). */
    @POST("api/v1/reportes/consulta")
    suspend fun consultar(@Body request: ConsultaRequest): ConsultaPublica

    /** Inicio de sesión del personal SIPINNA contra Cognito (público). */
    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    /** CU-09: bandeja del personal, con filtros opcionales: estatus, sin atender, riesgo y pendientes (requiere sesión). */
    @GET("api/v1/reportes")
    suspend fun listarReportes(
        @Query("estatus") estatus: String?,
        @Query("pagina") pagina: Int,
        @Query("tamano") tamano: Int,
        @Query("sinAtenderDias") sinAtenderDias: Int? = null,
        @Query("riesgo") riesgo: String? = null,
        @Query("pendientes") pendientes: Boolean? = null,
        @Query("prioridad") prioridad: String? = null,
        @Query("orden") orden: String? = null,
        @Query("vencidos") vencidos: Boolean? = null
    ): Pagina<ReporteResumen>

    /** Fase 8: formularios de subida directa de fotos para un reporte recién creado (público, con folio + clave). */
    @POST("api/v1/reportes/fotos/solicitud")
    suspend fun solicitarFotos(@Body r: SolicitarFotosRequest): SolicitudFotos

    /** Fase 8: confirma las fotos subidas; el servidor valida y re-codifica (público, con folio + clave). */
    @POST("api/v1/reportes/fotos/confirmar")
    suspend fun confirmarFotos(@Body r: ConfirmarFotosRequest): FotosConfirmadas

    /** Fase 8: fotos de un reporte para el personal, con URL de 60 s (requiere sesión). */
    @GET("api/v1/reportes/{id}/fotos")
    suspend fun fotos(@Path("id") id: Int): List<FotoPersonal>

    /** Fase 7: embudo y controles (vencidos, alertas) para el inicio del personal (requiere sesión). */
    @GET("api/v1/estadisticas/embudo")
    suspend fun embudo(): Embudo

    /** Fase 7: edita el expediente; solo se envían los campos que cambian (requiere sesión). */
    @PATCH("api/v1/reportes/{id}/expediente")
    suspend fun actualizarExpediente(@Path("id") id: Int, @Body cambios: Map<String, @JvmSuppressWildcards Any?>): ReporteDetalle

    /** Fase 7: personal que puede ser responsable del reporte (requiere sesión). */
    @GET("api/v1/reportes/{id}/responsables")
    suspend fun responsables(@Path("id") id: Int): List<Responsable>

    /** Resumen agregado para el inicio del personal (requiere sesión). */
    @GET("api/v1/estadisticas/resumen")
    suspend fun resumen(): ResumenPersonal

    /** Casos pendientes sin cambios en más de N días (requiere sesión). */
    @GET("api/v1/estadisticas/sin-atender")
    suspend fun sinAtender(@Query("dias") dias: Int): SinAtender

    /** CU-09: detalle con bitácora y transiciones permitidas (requiere sesión). */
    @GET("api/v1/reportes/{id}")
    suspend fun detalle(@Path("id") id: Int): ReporteDetalle

    /** CU-09/CU-10: cambio de estatus validado por la máquina de estados (requiere sesión). */
    @PATCH("api/v1/reportes/{id}/estatus")
    suspend fun cambiarEstatus(@Path("id") id: Int, @Body request: CambiarEstatusRequest): ReporteDetalle

    /** Nota de seguimiento sin cambio de estatus (requiere sesión). */
    @POST("api/v1/reportes/{id}/seguimientos")
    suspend fun agregarSeguimiento(@Path("id") id: Int, @Body request: AgregarSeguimientoRequest): ReporteDetalle
}
