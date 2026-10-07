package mx.sipinna.rieti.network

import mx.sipinna.rieti.model.ActualizarReporteRequest
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.LoginRequest
import mx.sipinna.rieti.model.LoginResponse
import mx.sipinna.rieti.model.Reporte
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * Punto único de acceso al API REST, siguiendo el patrón singleton visto en
 * clase (`ServicioRemoto`): construye Retrofit una sola vez (`by lazy`) y
 * expone funciones `suspend` que los ViewModels llaman directamente.
 *
 * No se usa un framework de inyección de dependencias (Hilt/Koin) a propósito,
 * para mantener el código básico (KISS). Cada función envuelve la llamada en
 * `try/catch` para no propagar excepciones de red hasta el ViewModel.
 *
 * `URL_BASE` apunta a `10.0.2.2`, la forma en que el emulador de Android
 * Studio accede al `localhost` de la máquina donde corre el backend.
 */
object ServicioRemoto {

    private const val URL_BASE = "http://10.0.2.2:3000/"

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .build()

    private val retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(URL_BASE)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    private val servicio by lazy {
        retrofit.create(ApiService::class.java)
    }

    /** Envía un nuevo reporte al backend. Devuelve null si la petición falla. */
    suspend fun crearReporte(request: CrearReporteRequest): Reporte? {
        return try {
            servicio.crearReporte(request)
        } catch (e: Exception) {
            null
        }
    }

    /** Lista todos los reportes/casos. Devuelve lista vacía si la petición falla. */
    suspend fun listarReportes(): List<Reporte> {
        return try {
            servicio.listarReportes()
        } catch (e: Exception) {
            emptyList()
        }
    }

    /** Busca un caso por folio público. Devuelve null si no existe o falla la petición. */
    suspend fun buscarPorFolio(folio: String): Reporte? {
        return try {
            servicio.buscarPorFolio(folio)
        } catch (e: Exception) {
            null
        }
    }

    /** Actualiza estatus/comentario de un caso. Devuelve null si falla la petición. */
    suspend fun actualizarReporte(id: Int, request: ActualizarReporteRequest): Reporte? {
        return try {
            servicio.actualizarReporte(id, request)
        } catch (e: Exception) {
            null
        }
    }

    /** Intenta iniciar sesión. Devuelve null si las credenciales fallan o hay error de red. */
    suspend fun login(request: LoginRequest): LoginResponse? {
        return try {
            servicio.login(request)
        } catch (e: Exception) {
            null
        }
    }
}
