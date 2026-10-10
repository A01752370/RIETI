package mx.sipinna.rieti.network

import mx.sipinna.rieti.model.AgregarSeguimientoRequest
import mx.sipinna.rieti.model.AvisoPrivacidad
import mx.sipinna.rieti.model.CambiarEstatusRequest
import mx.sipinna.rieti.model.ConsultaPublica
import mx.sipinna.rieti.model.ConsultaRequest
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.LoginRequest
import mx.sipinna.rieti.model.LoginResponse
import mx.sipinna.rieti.model.Municipio
import mx.sipinna.rieti.model.Pagina
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.model.ReporteDetalle
import mx.sipinna.rieti.model.ReporteResumen
import retrofit2.http.Body
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

    /** CU-04: registra un reporte anónimo; devuelve folio y clave (público). */
    @POST("api/v1/reportes")
    suspend fun crearReporte(@Body request: CrearReporteRequest): ReporteCreado

    /** CU-08: consulta ciudadana con folio + clave (público). */
    @POST("api/v1/reportes/consulta")
    suspend fun consultar(@Body request: ConsultaRequest): ConsultaPublica

    /** Inicio de sesión del personal SIPINNA contra Cognito (público). */
    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    /** CU-09: bandeja del personal, con filtro opcional por estatus (requiere sesión). */
    @GET("api/v1/reportes")
    suspend fun listarReportes(
        @Query("estatus") estatus: String?,
        @Query("pagina") pagina: Int,
        @Query("tamano") tamano: Int
    ): Pagina<ReporteResumen>

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
