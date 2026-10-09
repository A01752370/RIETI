package mx.sipinna.rieti.view

import android.net.Uri

/**
 * Rutas del `NavHost` de [MainActivity]. Centralizarlas evita errores de
 * tipeo al navegar (equivalente en Compose a los `Intent` entre Activities).
 */
object Rutas {
    /** Pantalla de inicio: reportar, consultar o entrar como personal. */
    const val INICIO = "inicio"

    /** Aviso de privacidad antes de reportar (CU-02). */
    const val AVISO = "aviso"

    /** Formulario de reporte; recibe la versión del aviso aceptada. */
    const val FORMULARIO = "formulario/{avisoVersion}"

    /** Confirmación con folio y clave. */
    const val CONFIRMACION = "confirmacion/{folio}/{clave}"

    /** Consulta ciudadana con folio + clave. */
    const val CONSULTA = "consulta"

    /** Inicio de sesión del personal. */
    const val LOGIN = "login"

    /** Bandeja del personal. */
    const val BANDEJA = "bandeja"

    /** Detalle y seguimiento de un reporte. */
    const val DETALLE = "detalle/{id}"

    /** Ruta del formulario con la versión del aviso. */
    fun formulario(avisoVersion: String) = "formulario/${Uri.encode(avisoVersion)}"

    /** Ruta de la confirmación. La clave solo vive en la pila de navegación en memoria. */
    fun confirmacion(folio: String, clave: String) = "confirmacion/${Uri.encode(folio)}/${Uri.encode(clave)}"

    /** Ruta del detalle de un reporte. */
    fun detalle(id: Int) = "detalle/$id"
}
