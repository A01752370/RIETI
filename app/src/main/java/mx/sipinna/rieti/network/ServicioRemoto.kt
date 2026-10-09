package mx.sipinna.rieti.network

import java.util.concurrent.TimeUnit
import mx.sipinna.rieti.BuildConfig
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * Punto único de acceso al API REST (patrón singleton visto en clase): construye
 * Retrofit una sola vez (`by lazy`) y guarda el token de la sesión del personal.
 *
 * `BuildConfig.API_URL` apunta a CloudFront (HTTPS). Para un backend local en el
 * emulador: `./gradlew assembleDebug -Prieti.apiUrl=http://10.0.2.2:3000/`
 * (solo el build debug permite HTTP, y solo hacia 10.0.2.2).
 */
object ServicioRemoto {

    /**
     * Access token de Cognito. **Solo en memoria**: no se escribe en disco ni en
     * preferencias, así que al cerrar la app hay que volver a iniciar sesión.
     */
    @Volatile
    var accessToken: String? = null

    /** Agrega `Authorization: Bearer` cuando hay sesión. */
    private val authInterceptor = Interceptor { chain ->
        val token = accessToken
        val peticion = if (token != null) {
            chain.request().newBuilder().header("Authorization", "Bearer $token").build()
        } else {
            chain.request()
        }
        chain.proceed(peticion)
    }

    // Nunca BODY: los cuerpos llevan contraseñas, claves de consulta y datos de reportes de menores.
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        redactHeader("Authorization")
    }

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .addInterceptor(loggingInterceptor)
        .build()

    private val retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    /** Implementación de [ApiService] generada por Retrofit. */
    val api: ApiService by lazy { retrofit.create(ApiService::class.java) }
}
