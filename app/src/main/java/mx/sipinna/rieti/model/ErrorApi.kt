package mx.sipinna.rieti.model

/**
 * Formato único de error del API: `{codigo, mensaje, detalle?}`.
 *
 * @property codigo código estable (p. ej. `FOLIO_O_CLAVE_INCORRECTOS`) para decidir qué hacer
 * @property mensaje texto en español apto para mostrarse al usuario
 * @property detalle lista opcional de errores de validación
 */
data class ErrorApi(
    val codigo: String?,
    val mensaje: String?,
    val detalle: List<String>?
)
