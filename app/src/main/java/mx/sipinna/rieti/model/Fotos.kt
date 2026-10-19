package mx.sipinna.rieti.model

/**
 * Cuerpo de `POST /api/v1/reportes/fotos/solicitud` (Fase 8): folio + clave del reporte
 * recién creado y cuántas fotos se subirán (1 a 3).
 */
data class SolicitarFotosRequest(val folio: String, val clave: String, val cantidad: Int)

/**
 * Formularios de subida directa al almacén privado (POST prefirmado de S3, 5 min, ≤ 5 MB).
 *
 * @property subidas uno por foto: `url` y `campos` que van antes del archivo
 */
data class SolicitudFotos(val subidas: List<SubidaFoto>, val maxBytes: Int, val expiraEnSegundos: Int)

/** Un formulario de subida. */
data class SubidaFoto(val id: String, val url: String, val campos: Map<String, String>)

/** Cuerpo de `POST /api/v1/reportes/fotos/confirmar`. */
data class ConfirmarFotosRequest(val folio: String, val clave: String, val ids: List<String>)

/** Respuesta de la confirmación: fotos que quedaron en el reporte. */
data class FotosConfirmadas(val fotos: Int)

/**
 * Foto para el personal (`GET /api/v1/reportes/{id}/fotos`): solo una URL de lectura que
 * caduca en [expiraEnSegundos]. Verla queda en la bitácora de accesos del servidor.
 */
data class FotoPersonal(val id: Int, val url: String, val expiraEnSegundos: Int, val ancho: Int, val alto: Int)
