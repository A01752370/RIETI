package mx.sipinna.rieti.network

import mx.sipinna.rieti.model.ActualizarReporteRequest
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.LoginRequest
import mx.sipinna.rieti.model.LoginResponse
import mx.sipinna.rieti.model.Reporte
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Contrato del API REST expuesto por el backend (NestJS) consumido por la app.
 *
 * Este es el punto de acoplamiento entre el rol de "App Android" y el rol de
 * "Backend" del equipo: cualquier cambio de ruta, método o forma del JSON
 * aquí debe acordarse con quien desarrolla el backend.
 *
 * Todas las funciones son `suspend` porque se llaman desde corrutinas
 * (`viewModelScope.launch`) en los ViewModels, nunca directamente desde la UI.
 */
interface ApiService {

    /** CU-04: registra un nuevo reporte ciudadano. Devuelve el reporte creado (con folio). */
    @POST("reportes")
    suspend fun crearReporte(@Body request: CrearReporteRequest): Reporte

    /** CU-09: lista todos los reportes/casos, usada por el panel de personal SIPINNA. */
    @GET("reportes")
    suspend fun listarReportes(): List<Reporte>

    /** CU-08: consulta de seguimiento ciudadano por folio público. */
    @GET("reportes/folio/{folio}")
    suspend fun buscarPorFolio(@Path("folio") folio: String): Reporte

    /** CU-09/CU-10: actualiza estatus y agrega un comentario de seguimiento al caso. */
    @PATCH("reportes/{id}")
    suspend fun actualizarReporte(
        @Path("id") id: Int,
        @Body request: ActualizarReporteRequest
    ): Reporte

    /** Inicio de sesión de personal SIPINNA / administración. */
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse
}
