package mx.sipinna.rieti.repository

import mx.sipinna.rieti.model.Actividad
import mx.sipinna.rieti.model.GeoReversa
import mx.sipinna.rieti.model.AgregarSeguimientoRequest
import mx.sipinna.rieti.model.AvisoPrivacidad
import mx.sipinna.rieti.model.CambiarEstatusRequest
import mx.sipinna.rieti.model.ConsultaPublica
import mx.sipinna.rieti.model.ConsultaRequest
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.Embudo
import mx.sipinna.rieti.model.Municipio
import mx.sipinna.rieti.model.Pagina
import mx.sipinna.rieti.model.ReporteCreado
import mx.sipinna.rieti.model.ReporteDetalle
import mx.sipinna.rieti.model.ReporteResumen
import mx.sipinna.rieti.model.ResumenPersonal
import mx.sipinna.rieti.model.SinAtender
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.sipinna.rieti.model.ConfirmarFotosRequest
import mx.sipinna.rieti.model.FotoPersonal
import mx.sipinna.rieti.model.SolicitarFotosRequest
import mx.sipinna.rieti.network.ApiService
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import mx.sipinna.rieti.network.ServicioRemoto

/**
 * Acceso a los reportes (ciudadano y personal). Los ViewModels hablan con este
 * repositorio, nunca con Retrofit directamente: así el manejo de errores queda
 * en un solo lugar y la red se puede sustituir en pruebas.
 *
 * @param api implementación del API (por defecto, la de [ServicioRemoto])
 */
class ReportesRepositorio(
    private val api: ApiService = ServicioRemoto.api,
    /** Cliente sin credenciales para el almacén de fotos (nunca lleva el token del API). */
    private val almacen: OkHttpClient = ALMACEN
) {

    companion object {
        private val ALMACEN: OkHttpClient by lazy {
            OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()
        }
    }

    /**
     * Fase 8: sube las fotos (ya reducidas y sin metadatos) de un reporte recién creado.
     * Pide los formularios con folio + clave, sube cada foto directo al almacén privado y confirma.
     *
     * @return fotos que quedaron en el reporte
     */
    suspend fun subirFotos(folio: String, clave: String, fotos: List<ByteArray>): Resultado<Int> {
        if (fotos.isEmpty()) return Resultado.Exito(0)
        val solicitud = when (val s = ejecutar { api.solicitarFotos(SolicitarFotosRequest(folio, clave, fotos.size)) }) {
            is Resultado.Error -> return s
            is Resultado.Exito -> s.datos
        }
        for ((i, subida) in solicitud.subidas.withIndex()) {
            val cuerpo = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
                subida.campos.forEach { (k, v) -> addFormDataPart(k, v) }
                // El archivo va al final: S3 ignora los campos que vienen después.
                addFormDataPart("file", "foto.jpg", fotos[i].toRequestBody("image/jpeg".toMediaType()))
            }.build()
            val ok = try {
                withContext(Dispatchers.IO) {
                    almacen.newCall(Request.Builder().url(subida.url).post(cuerpo).build()).execute().use { it.isSuccessful }
                }
            } catch (e: IOException) {
                return Resultado.Error("SIN_CONEXION", MensajesError.SIN_CONEXION)
            }
            if (!ok) return Resultado.Error("SUBIDA_FALLIDA", "No se pudo subir una de las fotos. Inténtalo de nuevo.")
        }
        return ejecutar { api.confirmarFotos(ConfirmarFotosRequest(folio, clave, solicitud.subidas.map { it.id })).fotos }
    }

    /** Fase 8: fotos de un reporte para el personal (URL de 60 s; el servidor registra el acceso). */
    suspend fun fotos(id: Int): Resultado<List<FotoPersonal>> = ejecutar { api.fotos(id) }

    /** Descarga una foto con su URL prefirmada (sin credenciales del API). */
    suspend fun descargarFoto(url: String): ByteArray? = try {
        withContext(Dispatchers.IO) {
            almacen.newCall(Request.Builder().url(url).build()).execute().use { r -> if (r.isSuccessful) r.body?.bytes() else null }
        }
    } catch (e: IOException) {
        null
    }

    /** Aviso de privacidad vigente. */
    suspend fun avisoPrivacidad(): Resultado<AvisoPrivacidad> = ejecutar { api.avisoPrivacidad() }

    /** Catálogo de municipios (D-16). */
    suspend fun municipios(): Resultado<List<Municipio>> = ejecutar { api.municipios() }

    /** Envía un reporte anónimo; el resultado trae folio y clave de consulta. */
    suspend fun crear(request: CrearReporteRequest, tokenCiudadano: String? = null): Resultado<ReporteCreado> =
        ejecutar { api.crearReporte(request, tokenCiudadano?.let { "Bearer $it" }) }

    /** Catálogo de actividades del servidor. */
    suspend fun actividades(): Resultado<List<Actividad>> = ejecutar { api.actividades() }

    /** Dirección sugerida y municipio de un punto del mapa. */
    suspend fun reversa(lat: Double, lng: Double): Resultado<GeoReversa> = ejecutar { api.reversa(lat, lng) }

    /** Consulta ciudadana con folio + clave. */
    suspend fun consultar(folio: String, clave: String): Resultado<ConsultaPublica> =
        ejecutar { api.consultar(ConsultaRequest(folio.trim(), clave.trim())) }

    /** Bandeja del personal; [estatus] null = todos. */
    /** Resumen agregado para el inicio del personal. */
    suspend fun resumen(): Resultado<ResumenPersonal> = ejecutar { api.resumen() }

    /** Casos pendientes sin cambios en más de [dias] días. */
    suspend fun sinAtender(dias: Int): Resultado<SinAtender> = ejecutar { api.sinAtender(dias) }

    /** Bandeja con filtro opcional de casos sin atender. */
    suspend fun listarSinAtender(dias: Int, pagina: Int = 1, tamano: Int = 50): Resultado<Pagina<ReporteResumen>> =
        ejecutar { api.listarReportes(null, pagina, tamano, dias) }

    suspend fun listar(estatus: String?, pagina: Int = 1, tamano: Int = 50): Resultado<Pagina<ReporteResumen>> =
        ejecutar { api.listarReportes(estatus, pagina, tamano) }

    /**
     * Bandeja con todos los filtros de la app (Fase 5).
     *
     * @param estatus estatus vigente, o null
     * @param sinAtenderDias solo pendientes sin cambios en más de N días, o null
     * @param prioridadAlta solo reportes con prioridad Alta (peligro inmediato; Fase 6)
     * @param pendientes solo casos en Recibido o En revisión
     */
    suspend fun listarFiltrado(
        estatus: String?,
        sinAtenderDias: Int?,
        prioridadAlta: Boolean,
        pendientes: Boolean,
        pagina: Int = 1,
        tamano: Int = 50,
        vencidos: Boolean = false
    ): Resultado<Pagina<ReporteResumen>> = ejecutar {
        // Fase 6: la bandeja de la app se ordena por prioridad (Alta primero).
        api.listarReportes(
            estatus, pagina, tamano, sinAtenderDias,
            pendientes = if (pendientes) true else null, prioridad = if (prioridadAlta) "Alta" else null, orden = "prioridad",
            vencidos = if (vencidos) true else null
        )
    }

    /** Embudo y controles del inicio (Fase 7). */
    suspend fun embudo(): Resultado<Embudo> = ejecutar { api.embudo() }

    /** Cambia campos del expediente (Fase 7); `null` borra el valor. */
    suspend fun actualizarExpediente(id: Int, cambios: Map<String, Any?>): Resultado<ReporteDetalle> =
        ejecutar { api.actualizarExpediente(id, cambios) }

    /** Se asigna como responsable a quien tiene la sesión (Fase 7). */
    suspend fun asignarme(id: Int, correo: String): Resultado<ReporteDetalle> =
        when (val lista = ejecutar { api.responsables(id) }) {
            is Resultado.Error -> lista
            is Resultado.Exito -> lista.datos.firstOrNull { it.correo.equals(correo, ignoreCase = true) }
                ?.let { yo -> ejecutar { api.actualizarExpediente(id, mapOf("idResponsable" to yo.id)) } }
                ?: Resultado.Error("SIN_ACCESO", "No encontramos tu cuenta entre el personal de este municipio.")
        }

    /** Detalle de un reporte para el personal. */
    suspend fun detalle(id: Int): Resultado<ReporteDetalle> = ejecutar { api.detalle(id) }

    /** Cambia el estatus; el servidor valida la transición. */
    suspend fun cambiarEstatus(id: Int, estatus: String, comentario: String?, motivo: String?, resultado: String? = null): Resultado<ReporteDetalle> =
        ejecutar {
            api.cambiarEstatus(
                id,
                CambiarEstatusRequest(
                    estatus, comentario?.takeIf { it.isNotBlank() }, motivo?.takeIf { it.isNotBlank() }, resultado?.takeIf { it.isNotBlank() }
                )
            )
        }

    /** Agrega una nota (o una acción realizada, Fase 7) sin cambiar el estatus. */
    suspend fun agregarSeguimiento(id: Int, comentario: String, accion: Boolean = false): Resultado<ReporteDetalle> =
        ejecutar { api.agregarSeguimiento(id, AgregarSeguimientoRequest(comentario, if (accion) "accion" else null)) }
}
