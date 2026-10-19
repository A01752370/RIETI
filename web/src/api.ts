/**
 * Cliente del API `/api/v1` (mismo origen que la web: sin CORS ni CDN).
 *
 * La sesión del personal (access token de Cognito) vive **solo en memoria**:
 * no se guarda en `localStorage` ni en cookies; al recargar la página hay que
 * volver a iniciar sesión.
 */

/** Error del API con el formato único `{codigo, mensaje, detalle?}`. */
export class ErrorApi extends Error {
  constructor(
    /** Código estable, p. ej. `FOLIO_O_CLAVE_INCORRECTOS`. */
    readonly codigo: string,
    mensaje: string,
    /** Estatus HTTP, o 0 si no hubo respuesta. */
    readonly estatus: number,
    /** Errores de validación, si los hay. */
    readonly detalle: string[] = [],
  ) {
    super(mensaje);
  }
}

/** Mensajes cuando el servidor no manda uno legible; siempre dicen qué hacer. */
export const MENSAJES = {
  SIN_CONEXION: 'No pudimos conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.',
  INESPERADO: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos minutos.',
  SESION_EXPIRADA: 'Tu sesión terminó. Vuelve a iniciar sesión para continuar.',
} as const;

/**
 * Convierte la respuesta de error del servidor en {@link ErrorApi}. Es pura
 * para poder probarla sin red.
 */
export function errorDesdeRespuesta(estatus: number, cuerpo: unknown): ErrorApi {
  const c = (cuerpo ?? {}) as { codigo?: unknown; mensaje?: unknown; detalle?: unknown };
  const codigo = typeof c.codigo === 'string' ? c.codigo : `HTTP_${estatus}`;
  const detalle = Array.isArray(c.detalle) ? c.detalle.map(String) : [];
  if (estatus === 401 && codigo === 'NO_AUTENTICADO') return new ErrorApi(codigo, MENSAJES.SESION_EXPIRADA, estatus, detalle);
  const mensaje = typeof c.mensaje === 'string' && c.mensaje.trim() ? c.mensaje : MENSAJES.INESPERADO;
  return new ErrorApi(codigo, mensaje, estatus, detalle);
}

// ---------- Sesión del personal (en memoria) ----------

/** Datos de la sesión activa. */
export interface Sesion {
  token: string;
  correo: string;
  /** Solo para mostrar u ocultar la administración; el servidor vuelve a validar cada permiso (Fase 7). */
  esAdministrador?: boolean;
}

let sesion: Sesion | null = null;
const oyentes = new Set<() => void>();

/** Sesión actual o null. */
export const obtenerSesion = (): Sesion | null => sesion;

/** Suscribe a cambios de sesión (para `useSyncExternalStore`). */
export function suscribirSesion(fn: () => void): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Cambia la sesión y avisa a la interfaz. */
export function fijarSesion(nueva: Sesion | null): void {
  sesion = nueva;
  oyentes.forEach((fn) => fn());
}

// ---------- Llamadas ----------

/**
 * `fetch` al API con JSON, token si hay sesión y errores traducidos.
 * Si el servidor responde 401, la sesión se descarta.
 */
export async function llamar<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: 'application/json' };
  if (opciones.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (sesion) cabeceras.Authorization = `Bearer ${sesion.token}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(`/api/v1${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new ErrorApi('SIN_CONEXION', MENSAJES.SIN_CONEXION, 0);
  }
  const texto = await respuesta.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }
  if (!respuesta.ok) {
    const error = errorDesdeRespuesta(respuesta.status, cuerpo);
    if (respuesta.status === 401 && sesion) fijarSesion(null);
    throw error;
  }
  return cuerpo as T;
}

// ---------- Tipos del contrato (docs/api/openapi.json) ----------

/** Sección del aviso de privacidad. */
export interface SeccionAviso { titulo: string; parrafos: string[] }
/** Aviso de privacidad vigente. `secciones` agrupa el mismo texto con títulos (servidores anteriores no lo envían). */
export interface AvisoPrivacidad { version: string; parrafos: string[]; secciones?: SeccionAviso[] }
/** Catálogos del formulario. */
export interface Catalogos {
  actividades: string[]; rangosEdad: string[]; riesgos: string[]; estatus: string[];
  /** Fase 6 (servidores anteriores no lo envían). */
  estatusDetalle?: { nombre: string; etiqueta: string }[]; peligro?: string[]; cantidades?: string[];
}
/** Municipio del selector (D-16). */
export interface Municipio { id: number; clave: string | null; nombre: string }
/** Respuesta al crear un reporte. */
export interface ReporteCreado { folio: string; claveConsulta: string; estatus: string; fechaCreacion: string }
/** Consulta pública: solo estatus y fechas. */
export interface ConsultaPublica {
  folio: string; estatus: string; fechaCreacion: string; fechaActualizacion: string;
  historial: { estatus: string; fecha: string }[];
}
/** Contacto de la red de municipios (D-17). */
export interface Contacto { tipo: 'correo' | 'enlace'; valor: string; etiqueta: string | null; esEjemplo: boolean }
/** Directorio de la red. */
export interface RedMunicipios {
  hayDatosDeEjemplo: boolean;
  municipios: { id: number; clave: string | null; nombre: string; contactos: Contacto[] }[];
}
/** Fila de la bandeja. */
export interface ReporteResumen {
  id: number; folio: string; estatus: string; ubicacion: string; municipio: string | null; actividad: string;
  /** Fase 6: prioridad calculada por el servidor y peligro inmediato (servidores anteriores no los envían). */
  prioridad?: 'Alta' | 'Media' | 'Normal'; peligroInmediato?: string | null;
  /** Fase 7 (servidores anteriores no los envían). */
  verificacion?: string; esDuplicado?: boolean; seguimientoVencido?: boolean;
  edadAproximada: string; cantidadNinos: number; situacionRiesgo: string; fechaCreacion: string; fechaActualizacion: string;
}
/** Página de la bandeja. */
export interface Pagina<T> { elementos: T[]; total: number; pagina: number; tamano: number }
/** Detalle de un reporte para el personal. */
export interface ReporteDetalle extends ReporteResumen {
  latitud: number | null; longitud: number | null; descripcion: string; motivoDescarte: string | null;
  historial: EventoBitacora[];
  transicionesPermitidas: string[];
  /** Cuándo entró el caso a su estatus vigente (Fase 5; servidores anteriores no lo envían). */
  fechaEstatusActual?: string;
  /** Menores por grupo de edad (Fase 2; servidores anteriores no lo envían). */
  grupos?: GrupoMenores[];
  actividadOtro?: string | null;
  direccion?: DireccionRespuesta | null;
  /** Expediente interno y duplicados (Fase 7; servidores anteriores no lo envían). */
  expediente?: Expediente;
  duplicadoDe?: ReporteRelacionado | null;
  duplicados?: ReporteRelacionado[];
}
/** Tipo de evento de la bitácora. */
export type TipoEvento = 'registro' | 'cambio' | 'nota' | 'accion' | 'expediente';
/** Evento de la bitácora (solo personal). `tipo` llega desde la Fase 5; `accion` y `expediente` desde la Fase 7. */
export interface EventoBitacora {
  estatus: string; comentario: string | null; autor: string | null; fecha: string;
  tipo?: TipoEvento;
}
/** Id y nombre de un catálogo. */
export interface IdNombre { id: number; nombre: string }
/** Expediente interno del caso (Fase 7). */
export interface Expediente {
  responsable: { id: number; correo: string } | null;
  dependencia: IdNombre | null;
  fechaSeguimiento: string | null;
  seguimientoVencido: boolean;
  resultado: string | null;
  fechaCierre: string | null;
  modalidad: IdNombre | null;
  verificacion: string;
  nnaIdentificados: number | null; nnaCanalizados: number | null; nnaNinas: number | null; nnaNinos: number | null;
}
/** Cambios al expediente: `null` borra el valor. */
export type CambiosExpediente = Partial<{
  idResponsable: number | null; idDependencia: number | null; fechaSeguimiento: string | null; idModalidad: number | null;
  verificacion: string; nnaIdentificados: number | null; nnaCanalizados: number | null; nnaNinas: number | null; nnaNinos: number | null;
}>;
/** Reporte relacionado (duplicado o cercano). */
export interface ReporteRelacionado { id: number; folio: string; estatus: string; estatusEtiqueta: string; fechaCreacion: string; distanciaMetros?: number }
/** Catálogos del expediente. */
export interface CatalogosExpediente { dependencias: IdNombre[]; modalidades: IdNombre[]; verificaciones: string[]; tiposAccion: string[] }
/** Embudo de atención (Fase 7). */
export interface Embudo {
  recibidos: number; verificados: number; casosIdentificados: number; nnaIdentificados: number; nnaCanalizados: number;
  duplicadosDescontados: number; prioridadAltaPendientes: number; seguimientosVencidos: number; alertasAbiertas: number;
}
/** Alerta de punto recurrente (Fase 7). */
export interface Alerta {
  id: number; municipio: string | null; latitud: number; longitud: number; reportes: number; estatus: 'abierta' | 'atendida';
  fechaCreacion: string; fechaActualizacion: string; comentario: string | null; relacionados: { id: number; folio: string }[];
}
/** Persona del personal con sus municipios (administración). */
export interface PersonaPersonal { id: number; correo: string; perfil: string; activo: boolean; regional: boolean; municipios: IdNombre[] }
/** Parámetro editable por el Administrador. */
export interface Parametro { clave: string; valor: number; descripcion: string; minimo: number; maximo: number; fechaActualizacion: string }
/** Dependencia del catálogo. */
export interface Dependencia { id: number; nombre: string; activo: boolean }
/** Entrada de la bitácora de accesos. */
export interface Acceso { id: number; usuario: string; accion: string; folio: string | null; detalle: string | null; fecha: string }
/** Menores observados en un rango de edad. */
export interface GrupoMenores { rango: string; cantidad: number }
/** Dirección estructurada del lugar de los hechos. */
export interface Direccion { calle: string; numeroExterior?: string; colonia: string; codigoPostal: string; referencias?: string }
/** Dirección tal como la devuelve el servidor (campos opcionales). */
export interface DireccionRespuesta {
  calle: string | null; numeroExterior: string | null; colonia: string | null; codigoPostal: string | null; referencias: string | null;
}
/** Perfil y permisos del personal (D-18). */
export interface Perfil {
  correo: string; perfil: string; grupos: string[]; permisos: { permiso: string; descripcion: string }[];
  /** Municipios que puede ver; null = todos (Fase 7; servidores anteriores no lo envían). */
  municipios?: IdNombre[] | null;
}
/** Resumen del panel (solo agregados). */
export interface ResumenEstadisticas {
  total: number; nuevosUltimos7Dias: number; sinMunicipio: number; pendientes: number;
  /** Pendientes en los que quien reportó percibió riesgo (Fase 5). */
  riesgoAltoPendientes?: number;
  /** Pendientes con prioridad Alta, es decir, con peligro inmediato (Fase 6). */
  prioridadAltaPendientes?: number;
  porEstatus: { etiqueta: string; total: number }[]; porMes: { etiqueta: string; total: number }[];
}
/** Conteo que el servidor oculta (`null`) si es menor que el umbral. */
export interface ConteoProtegido { etiqueta: string; total: number | null }
/** Distribuciones del panel (Fase 3). */
export interface Distribuciones { umbral: number; porMunicipio: ConteoProtegido[]; porActividad: ConteoProtegido[]; porGrupoEdad: ConteoProtegido[] }
/** Tiempo promedio en cada estatus. */
export interface Tiempos {
  umbral: number; porEstatus: { estatus: string; horasPromedio: number | null; casos: number }[];
  /** Del alta al primer cambio de estatus (Fase 5). */
  hastaPrimeraRevision?: TiempoHito;
  /** Del alta a "Concluido" (Fase 5). */
  hastaConclusion?: TiempoHito;
}
/** Tiempo hasta un hito: promedio y mediana en horas, o null si hay menos de `minimoCasos` (datos insuficientes). */
export interface TiempoHito { horasPromedio: number | null; horasMediana: number | null; casos: number; minimoCasos: number }
/** Casos pendientes sin cambios en más de N días. */
export interface SinAtender { dias: number; total: number; umbral: number; porMunicipio: ConteoProtegido[] }
/** Celda del mapa de calor (centro de la celda, nunca la ubicación de un reporte). */
export interface CeldaCalor { lat: number; lng: number; total: number }
/** Mapa de calor agregado. */
export interface MapaCalor { umbral: number; tamanoCelda: number; celdas: CeldaCalor[]; ocultas: number; sinUbicacion: number }
/** Filtros comunes del panel. */
export interface FiltrosPanel { desde?: string; hasta?: string; municipioId?: number; estatus?: string; actividad?: string; prioridad?: string }
/** Filtros de la bandeja y la exportación. */
export interface FiltrosBandeja extends FiltrosPanel {
  folio?: string; sinAtenderDias?: number; orden?: 'recientes' | 'antiguos' | 'prioridad';
  /** Riesgo percibido ("Sí" = riesgo alto; Fase 5). */
  riesgo?: string;
  /** Solo casos pendientes, Recibido o En revisión (Fase 5). */
  pendientes?: boolean;
  /** Solo casos abiertos con seguimiento vencido y por verificación (Fase 7). */
  vencidos?: boolean;
  verificacion?: string;
}

/** Datos del formulario de reporte (formato de la Fase 2: grupos de edad y dirección). */
export interface NuevoReporte {
  municipioId: number; direccion: Direccion; grupos: GrupoMenores[]; actividad: string; actividadOtro?: string;
  situacionRiesgo: string; descripcion: string; avisoPrivacidadVersion: string;
  /** Fase 6: peligro inmediato, categoría de cantidad y canal (`web`; con canal, el folio lleva clave municipal). */
  peligroInmediato?: string; cantidad?: string; canal?: 'web';
}

/** Arma una cadena de consulta omitiendo valores vacíos (y los booleanos en `false`). */
export function consulta(params: { [k: string]: string | number | boolean | undefined | null }): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Llamadas tipadas al API. */
export const api = {
  aviso: () => llamar<AvisoPrivacidad>('/avisos-privacidad/vigente'),
  catalogos: () => llamar<Catalogos>('/catalogos'),
  municipios: () => llamar<Municipio[]>('/catalogos/municipios'),
  crearReporte: (r: NuevoReporte) => llamar<ReporteCreado>('/reportes', { metodo: 'POST', cuerpo: r }),
  consultar: (folio: string, clave: string) => llamar<ConsultaPublica>('/reportes/consulta', { metodo: 'POST', cuerpo: { folio, clave } }),
  red: () => llamar<RedMunicipios>('/red-municipios'),
  login: (correo: string, password: string) =>
    llamar<{ accessToken: string; correo: string; esAdministrador?: boolean }>('/auth/login', { metodo: 'POST', cuerpo: { correo, password } }),
  perfil: () => llamar<Perfil>('/auth/perfil'),
  reportes: (f: FiltrosBandeja & { pagina?: number }) =>
    llamar<Pagina<ReporteResumen>>(`/reportes${consulta({ ...f, tamano: 50 })}`),
  detalle: (id: number) => llamar<ReporteDetalle>(`/reportes/${id}`),
  cambiarEstatus: (id: number, estatus: string, comentario?: string, motivo?: string, resultado?: string) =>
    llamar<ReporteDetalle>(`/reportes/${id}/estatus`, {
      metodo: 'PATCH', cuerpo: { estatus, comentario: comentario || undefined, motivo: motivo || undefined, resultado: resultado || undefined },
    }),
  agregarNota: (id: number, comentario: string, tipo: 'nota' | 'accion' = 'nota') =>
    llamar<ReporteDetalle>(`/reportes/${id}/seguimientos`, { metodo: 'POST', cuerpo: tipo === 'accion' ? { comentario, tipo } : { comentario } }),
  // Fase 7: expediente, duplicados, alertas y administración.
  catalogosExpediente: () => llamar<CatalogosExpediente>('/catalogos/expediente'),
  actualizarExpediente: (id: number, cambios: CambiosExpediente) =>
    llamar<ReporteDetalle>(`/reportes/${id}/expediente`, { metodo: 'PATCH', cuerpo: cambios }),
  responsables: (id: number) => llamar<{ id: number; correo: string; perfil: string }[]>(`/reportes/${id}/responsables`),
  cercanos: (id: number) => llamar<ReporteRelacionado[]>(`/reportes/${id}/cercanos`),
  vincularDuplicado: (id: number, idPrincipal: number) =>
    llamar<ReporteDetalle>(`/reportes/${id}/duplicado`, { metodo: 'POST', cuerpo: { idPrincipal } }),
  desvincularDuplicado: (id: number) => llamar<ReporteDetalle>(`/reportes/${id}/duplicado`, { metodo: 'DELETE' }),
  embudo: (f: FiltrosPanel) => llamar<Embudo>(`/estadisticas/embudo${consulta({ ...f })}`),
  alertas: (estatus: 'abierta' | 'atendida' | 'todas' = 'abierta') => llamar<Alerta[]>(`/alertas${consulta({ estatus })}`),
  atenderAlerta: (id: number, estatus: 'atendida' | 'abierta', comentario?: string) =>
    llamar<{ id: number; estatus: string }>(`/alertas/${id}`, { metodo: 'PATCH', cuerpo: { estatus, comentario: comentario || undefined } }),
  personal: () => llamar<PersonaPersonal[]>('/admin/personal'),
  asignarMunicipios: (id: number, municipios: number[]) =>
    llamar<PersonaPersonal>(`/admin/personal/${id}/municipios`, { metodo: 'PUT', cuerpo: { municipios } }),
  configuracion: () => llamar<Parametro[]>('/admin/configuracion'),
  guardarConfiguracion: (valores: Record<string, number>) =>
    llamar<Parametro[]>('/admin/configuracion', { metodo: 'PUT', cuerpo: { valores } }),
  dependencias: () => llamar<Dependencia[]>('/admin/dependencias'),
  crearDependencia: (nombre: string) => llamar<Dependencia>('/admin/dependencias', { metodo: 'POST', cuerpo: { nombre } }),
  editarDependencia: (id: number, cambios: { nombre?: string; activo?: boolean }) =>
    llamar<Dependencia>(`/admin/dependencias/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  accesos: (f: { folio?: string; desde?: string; hasta?: string; pagina?: number }) =>
    llamar<Pagina<Acceso>>(`/admin/accesos${consulta({ ...f, tamano: 50 })}`),
  estadisticas: (f: FiltrosPanel) => llamar<ResumenEstadisticas>(`/estadisticas/resumen${consulta({ ...f })}`),
  distribuciones: (f: FiltrosPanel) => llamar<Distribuciones>(`/estadisticas/distribuciones${consulta({ ...f })}`),
  tiempos: (f: FiltrosPanel) => llamar<Tiempos>(`/estadisticas/tiempos${consulta({ ...f })}`),
  sinAtender: (f: FiltrosPanel & { dias: number }) => llamar<SinAtender>(`/estadisticas/sin-atender${consulta({ ...f })}`),
  mapaCalor: (f: FiltrosPanel) => llamar<MapaCalor>(`/estadisticas/mapa-calor${consulta({ ...f })}`),
};

/**
 * Descarga la bandeja filtrada en CSV. Se pide con el token de la sesión y se
 * entrega como archivo local (Blob), sin abrir otra página ni tocar la CSP.
 */
export async function descargarCsv(f: FiltrosBandeja): Promise<void> {
  const cabeceras: Record<string, string> = { Accept: 'text/csv' };
  const s = obtenerSesion();
  if (s) cabeceras.Authorization = `Bearer ${s.token}`;
  let r: Response;
  try {
    r = await fetch(`/api/v1/reportes/exportar.csv${consulta({ ...f })}`, { headers: cabeceras, credentials: 'omit', cache: 'no-store' });
  } catch {
    throw new ErrorApi('SIN_CONEXION', MENSAJES.SIN_CONEXION, 0);
  }
  if (!r.ok) {
    let cuerpo: unknown = null;
    try { cuerpo = await r.json(); } catch { /* sin cuerpo */ }
    if (r.status === 401 && s) fijarSesion(null);
    throw errorDesdeRespuesta(r.status, cuerpo);
  }
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `reportes-rieti-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
