package mx.sipinna.rieti.repository

import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import java.io.IOException
import kotlinx.coroutines.CancellationException
import mx.sipinna.rieti.model.ErrorApi
import retrofit2.HttpException

/**
 * Resultado de una operación contra el API, sin excepciones hacia arriba.
 * Los ViewModels lo convierten en `UiState`.
 */
sealed class Resultado<out T> {
    /** La operación salió bien. */
    data class Exito<T>(val datos: T) : Resultado<T>()

    /**
     * La operación falló.
     *
     * @property codigo código estable del API (o `SIN_CONEXION` / `ERROR_INESPERADO`)
     * @property mensaje mensaje en español para mostrar al usuario
     * @property estatusHttp código HTTP, o null si no hubo respuesta del servidor
     */
    data class Error(val codigo: String, val mensaje: String, val estatusHttp: Int? = null) : Resultado<Nothing>()
}

/** Mensajes de respaldo cuando el servidor no manda uno legible. */
object MensajesError {
    const val SIN_CONEXION = "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo."
    const val INESPERADO = "Ocurrió un error inesperado. Inténtalo de nuevo."
    const val SESION_EXPIRADA = "Tu sesión expiró. Vuelve a iniciar sesión."
}

/**
 * Traduce la respuesta de error del servidor (`{codigo, mensaje}`) a [Resultado.Error].
 * Es una función pura para poder probarla sin red.
 *
 * @param estatusHttp código HTTP de la respuesta
 * @param cuerpo cuerpo de la respuesta de error, o null
 */
fun errorDesdeRespuesta(estatusHttp: Int, cuerpo: String?): Resultado.Error {
    val api = try {
        cuerpo?.let { Gson().fromJson(it, ErrorApi::class.java) }
    } catch (e: JsonSyntaxException) {
        null
    }
    val codigo = api?.codigo ?: "HTTP_$estatusHttp"
    val mensaje = when {
        estatusHttp == 401 && codigo == "NO_AUTENTICADO" -> MensajesError.SESION_EXPIRADA
        !api?.mensaje.isNullOrBlank() -> api!!.mensaje!!
        else -> MensajesError.INESPERADO
    }
    return Resultado.Error(codigo, mensaje, estatusHttp)
}

/**
 * Ejecuta una llamada de Retrofit y convierte cualquier falla en [Resultado.Error].
 * Nunca registra el cuerpo de la petición ni de la respuesta (pueden traer datos sensibles).
 */
suspend fun <T> ejecutar(llamada: suspend () -> T): Resultado<T> = try {
    Resultado.Exito(llamada())
} catch (e: CancellationException) {
    throw e
} catch (e: HttpException) {
    errorDesdeRespuesta(e.code(), e.response()?.errorBody()?.string())
} catch (e: IOException) {
    Resultado.Error("SIN_CONEXION", MensajesError.SIN_CONEXION)
} catch (e: Exception) {
    Resultado.Error("ERROR_INESPERADO", MensajesError.INESPERADO)
}
