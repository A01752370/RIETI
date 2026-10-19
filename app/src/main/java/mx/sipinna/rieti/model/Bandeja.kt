package mx.sipinna.rieti.model

/**
 * Fila de la bandeja del personal (`GET /api/v1/reportes`).
 *
 * @property id identificador interno del reporte
 * @property folio folio público
 * @property estatus estatus vigente
 * @property ubicacion referencia del lugar de los hechos
 * @property municipio municipio donde ocurre, o null si el reporte no lo indicó
 * @property actividad actividad observada
 * @property edadAproximada rango de edad
 * @property cantidadNinos cantidad aproximada de menores
 * @property situacionRiesgo "Sí", "No" o "No sé"
 * @property fechaCreacion fecha de registro (ISO-8601)
 * @property fechaActualizacion fecha del último cambio (ISO-8601)
 * @property prioridad "Alta", "Media" o "Normal" (la calcula el servidor; Fase 6), o null si el servidor es anterior
 * @property peligroInmediato "Sí", "No" o "No sé" (null en reportes anteriores a la Fase 6)
 * @property seguimientoVencido la fecha de seguimiento ya pasó y el caso sigue abierto (Fase 7)
 * @property esDuplicado marcado como posible duplicado de otro reporte (Fase 7)
 */
data class ReporteResumen(
    val id: Int,
    val folio: String,
    val estatus: String,
    val prioridad: String? = null,
    val peligroInmediato: String? = null,
    val verificacion: String? = null,
    val esDuplicado: Boolean = false,
    val seguimientoVencido: Boolean = false,
    val ubicacion: String,
    val municipio: String?,
    val actividad: String,
    val edadAproximada: String,
    val cantidadNinos: Int,
    val situacionRiesgo: String,
    val fechaCreacion: String,
    val fechaActualizacion: String
)

/**
 * Página de resultados.
 *
 * @property elementos filas de esta página
 * @property total total de filas que cumplen el filtro
 * @property pagina número de página (desde 1)
 * @property tamano elementos por página
 */
data class Pagina<T>(
    val elementos: List<T>,
    val total: Int,
    val pagina: Int,
    val tamano: Int
)

/**
 * Detalle de un reporte para el personal (`GET /api/v1/reportes/{id}`).
 * Los campos que comparte con [ReporteResumen] significan lo mismo.
 *
 * @property latitud latitud del lugar de los hechos, o null
 * @property longitud longitud del lugar de los hechos, o null
 * @property descripcion descripción libre escrita por quien reportó
 * @property motivoDescarte motivo registrado al descartar, o null
 * @property grupos menores por grupo de edad (reportes anteriores a la Fase 2: un solo grupo; null si el servidor es anterior)
 * @property actividadOtro descripción de la actividad cuando es "Otro", o null
 * @property direccion dirección estructurada, o null si el reporte solo trae el texto de [ubicacion]
 * @property historial bitácora del caso, del evento más antiguo al más reciente
 * @property transicionesPermitidas estatus a los que se puede cambiar desde el actual;
 *   los calcula el servidor con la máquina de estados, la app solo los muestra
 * @property fechaEstatusActual cuándo entró el caso a su estatus vigente (Fase 5); null si el servidor es anterior
 * @property expediente expediente interno (Fase 7); null si el servidor es anterior
 * @property duplicadoDe reporte principal si este es un posible duplicado (Fase 7)
 */
data class ReporteDetalle(
    val id: Int,
    val folio: String,
    val estatus: String,
    val prioridad: String? = null,
    val peligroInmediato: String? = null,
    val cantidadCategoria: String? = null,
    val canal: String? = null,
    val origen: String? = null,
    val ubicacion: String,
    val municipio: String?,
    val actividad: String,
    val edadAproximada: String,
    val cantidadNinos: Int,
    val situacionRiesgo: String,
    val fechaCreacion: String,
    val fechaActualizacion: String,
    val latitud: Double?,
    val longitud: Double?,
    val descripcion: String,
    val motivoDescarte: String?,
    val historial: List<EventoSeguimiento>,
    val transicionesPermitidas: List<String>,
    val grupos: List<GrupoMenores>? = null,
    val actividadOtro: String? = null,
    val direccion: DireccionRespuesta? = null,
    val fechaEstatusActual: String? = null,
    val expediente: Expediente? = null,
    val duplicadoDe: ReporteRelacionado? = null,
    /** Fotos del reporte (Fase 8); se leen con `GET /reportes/{id}/fotos`. */
    val numeroFotos: Int = 0
)

/**
 * Expediente interno del caso (Fase 7). Solo personal.
 *
 * @property seguimientoVencido la fecha de seguimiento ya pasó y el caso sigue abierto
 */
data class Expediente(
    val responsable: Responsable?,
    val dependencia: IdNombre?,
    val fechaSeguimiento: String?,
    val seguimientoVencido: Boolean = false,
    val resultado: String?,
    val modalidad: IdNombre?,
    val verificacion: String = "Sin verificar",
    val nnaIdentificados: Int?,
    val nnaCanalizados: Int?
)

/** Persona del personal responsable de un caso. */
data class Responsable(val id: Int, val correo: String, val perfil: String? = null)

/** Elemento de un catálogo. */
data class IdNombre(val id: Int, val nombre: String)

/** Reporte relacionado (duplicado). */
data class ReporteRelacionado(val id: Int, val folio: String, val estatusEtiqueta: String)

/** Dirección de un reporte tal como la devuelve el servidor (cualquier campo puede faltar). */
data class DireccionRespuesta(
    val calle: String?,
    val numeroExterior: String?,
    val colonia: String?,
    val codigoPostal: String?,
    val referencias: String?
)

/**
 * Evento de la bitácora del caso (solo personal).
 *
 * @property estatus estatus del caso en ese momento
 * @property comentario nota registrada, o null
 * @property autor correo de quien la registró; null para el registro automático
 * @property fecha fecha del evento (ISO-8601)
 * @property tipo "registro", "cambio" (de estatus), "nota" (interna), "accion" o "expediente" (Fase 7); null si el servidor es anterior
 */
data class EventoSeguimiento(
    val estatus: String,
    val comentario: String?,
    val autor: String?,
    val fecha: String,
    val tipo: String? = null
)

/**
 * Cuerpo de `PATCH /api/v1/reportes/{id}/estatus`.
 *
 * @property estatus estatus destino (debe estar en [ReporteDetalle.transicionesPermitidas])
 * @property comentario comentario de seguimiento (opcional salvo al reabrir un caso concluido)
 * @property motivo motivo de descarte (obligatorio si [estatus] es "Descartado")
 * @property resultado resultado del caso (obligatorio al concluir; Fase 7)
 */
data class CambiarEstatusRequest(
    val estatus: String,
    val comentario: String?,
    val motivo: String?,
    val resultado: String? = null
)

/**
 * Cuerpo de `POST /api/v1/reportes/{id}/seguimientos`.
 *
 * @property comentario texto de la nota o de la acción
 * @property tipo null (nota) o "accion" (acción realizada; Fase 7)
 */
data class AgregarSeguimientoRequest(
    val comentario: String,
    val tipo: String? = null
)

/**
 * Embudo y controles del inicio del personal (`GET /api/v1/estadisticas/embudo`, Fase 7).
 *
 * @property seguimientosVencidos casos abiertos con la fecha de seguimiento vencida
 * @property alertasAbiertas alertas de punto recurrente abiertas en sus municipios
 */
data class Embudo(
    val recibidos: Int = 0,
    val verificados: Int = 0,
    val casosIdentificados: Int = 0,
    val nnaCanalizados: Int = 0,
    val seguimientosVencidos: Int = 0,
    val alertasAbiertas: Int = 0
)

/**
 * Resumen agregado para el inicio del personal (`GET /api/v1/estadisticas/resumen`).
 *
 * @property total reportes en total
 * @property nuevosUltimos7Dias reportes de los últimos 7 días
 * @property pendientes casos en Recibido o En revisión
 * @property porEstatus conteo por estatus, en el orden del proceso
 * @property riesgoAltoPendientes pendientes en los que quien reportó percibió riesgo (Fase 5)
 * @property prioridadAltaPendientes pendientes con prioridad Alta: peligro inmediato (Fase 6)
 */
data class ResumenPersonal(
    val total: Int,
    val nuevosUltimos7Dias: Int,
    val pendientes: Int = 0,
    val riesgoAltoPendientes: Int = 0,
    val prioridadAltaPendientes: Int = 0,
    val porEstatus: List<ConteoEstatus>
)

/** Conteo de un estatus. */
data class ConteoEstatus(val etiqueta: String, val total: Int)

/**
 * Casos pendientes sin cambios en más de [dias] días (`GET /api/v1/estadisticas/sin-atender`).
 *
 * @property total número de casos
 */
data class SinAtender(val dias: Int, val total: Int)
