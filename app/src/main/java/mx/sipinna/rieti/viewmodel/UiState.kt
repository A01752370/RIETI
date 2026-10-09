package mx.sipinna.rieti.viewmodel

import mx.sipinna.rieti.repository.Resultado

/**
 * Estado de una pantalla que carga o envía datos. Las pantallas solo leen este
 * estado; no contienen lógica de negocio.
 */
sealed class UiState<out T> {
    /** Aún no se ha pedido nada (p. ej. formulario vacío). */
    data object Inactivo : UiState<Nothing>()

    /** Hay una petición en curso. */
    data object Cargando : UiState<Nothing>()

    /** La petición terminó bien. */
    data class Exito<T>(val datos: T) : UiState<T>()

    /**
     * La petición falló.
     *
     * @property mensaje texto listo para mostrar
     * @property codigo código del API, útil para decidir acciones (p. ej. volver al login)
     */
    data class Error(val mensaje: String, val codigo: String? = null) : UiState<Nothing>()
}

/** Convierte el resultado del repositorio en estado de pantalla. */
fun <T> Resultado<T>.aUiState(): UiState<T> = when (this) {
    is Resultado.Exito -> UiState.Exito(datos)
    is Resultado.Error -> UiState.Error(mensaje, codigo)
}
