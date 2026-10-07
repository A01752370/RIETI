package mx.sipinna.rieti.view

/**
 * Nombres de ruta usados por el `NavHost` de [MainActivity].
 *
 * Centralizar las rutas aquí evita errores de tipeo al navegar entre
 * pantallas y es el equivalente, en Compose, a lo que antes eran los
 * `Intent` entre Activities.
 */
object Rutas {
    const val LOGIN = "login"
    const val REGISTRO = "registro"
    const val FORMULARIO = "formulario"
    const val CONFIRMACION = "confirmacion/{folio}"
    const val HOME = "home/{esAdmin}"
    const val REPORTES_LIST = "reportesList"
    const val SEGUIMIENTO = "seguimiento/{esAdmin}"

    fun confirmacion(folio: String) = "confirmacion/$folio"
    fun home(esAdmin: Boolean) = "home/$esAdmin"
    fun seguimiento(esAdmin: Boolean) = "seguimiento/$esAdmin"
}
