package mx.sipinna.rieti.network

import mx.sipinna.rieti.BuildConfig
import mx.sipinna.rieti.model.ActualizarReporteRequest
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.LoginRequest
import mx.sipinna.rieti.model.LoginResponse
import mx.sipinna.rieti.model.Reporte
import okhttp3.Interceptor
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
 * `URL_BASE` viene de `BuildConfig.API_URL` (API en AWS por HTTPS). Para usar
 * un backend local en el emulador: `-Prieti.apiUrl=http://10.0.2.2:3000/`.
 */
object ServicioRemoto {

    private val URL_BASE = BuildConfig.API_URL

    /**
     * Access token de Cognito devuelto por `POST /auth/login`. Solo en memoria:
     * al cerrar la app hay que volver a iniciar sesión.
     */
    @Volatile
    private var accessToken: String? = null

    /** Agrega `Authorization: Bearer` a las peticiones cuando hay sesión. */
    private val authInterceptor = Interceptor { chain ->
        val token = accessToken
        val peticion = if (token != null) {
            chain.request().newBuilder().header("Authorization", "Bearer $token").build()
        } else {
            chain.request()
        }
        chain.proceed(peticion)
    }

    // Nunca BODY: el cuerpo incluye contraseñas y datos de reportes de menores.
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        redactHeader("Authorization")
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
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
            servicio.login(request).also { accessToken = it.accessToken }
        } catch (e: Exception) {
            null
        }
    }

    /** Descarta el token de la sesión actual. */
    fun cerrarSesion() {
        accessToken = null
    }
}
