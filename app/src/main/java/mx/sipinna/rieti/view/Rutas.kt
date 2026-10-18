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

    /** Confirmación con folio y clave (y la fecha de registro para la línea de avance). */
    const val CONFIRMACION = "confirmacion/{folio}/{clave}?fecha={fecha}"

    /** Consulta ciudadana con folio + clave. */
    const val CONSULTA = "consulta"

    /** Acceso a la cuenta opcional de ciudadano (Fase 4). */
    const val CUENTA = "cuenta"

    /** "Mi panel": reportes vinculados a la cuenta de ciudadano. */
    const val MI_PANEL = "mi-panel"

    /** Configuración de la cuenta de ciudadano. */
    const val CUENTA_CONFIGURACION = "cuenta-configuracion"

    /** Inicio de sesión del personal. */
    const val LOGIN = "login"

    /** Inicio del personal: conteos y accesos rápidos (Fase 3). */
    const val INICIO_PERSONAL = "inicio-personal"

    /** Bandeja del personal, con filtros iniciales opcionales. */
    const val BANDEJA = "bandeja?estatus={estatus}&sinAtender={sinAtender}&riesgoAlto={riesgoAlto}&pendientes={pendientes}"

    /** Detalle y seguimiento de un reporte. */
    const val DETALLE = "detalle/{id}"

    /** Ruta del formulario con la versión del aviso. */
    fun formulario(avisoVersion: String) = "formulario/${Uri.encode(avisoVersion)}"

    /** Ruta de la confirmación. La clave solo vive en la pila de navegación en memoria. */
    fun confirmacion(folio: String, clave: String, fecha: String? = null) =
        "confirmacion/${Uri.encode(folio)}/${Uri.encode(clave)}?fecha=${Uri.encode(fecha ?: "")}"

    /** Ruta de la bandeja, opcionalmente filtrada por estatus, casos sin atender, pendientes o pendientes de riesgo alto. */
    fun bandeja(estatus: String? = null, sinAtender: Int? = null, riesgoAlto: Boolean = false, pendientes: Boolean = false): String =
        "bandeja?estatus=${Uri.encode(estatus ?: "")}&sinAtender=${sinAtender ?: 0}&riesgoAlto=$riesgoAlto&pendientes=$pendientes"

    /** Ruta del detalle de un reporte. */
    fun detalle(id: Int) = "detalle/$id"
}
