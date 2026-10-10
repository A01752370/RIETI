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

/** Aviso de privacidad vigente. */
export interface AvisoPrivacidad { version: string; parrafos: string[] }
/** Catálogos del formulario. */
export interface Catalogos { actividades: string[]; rangosEdad: string[]; riesgos: string[]; estatus: string[] }
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
  edadAproximada: string; cantidadNinos: number; situacionRiesgo: string; fechaCreacion: string; fechaActualizacion: string;
}
/** Página de la bandeja. */
export interface Pagina<T> { elementos: T[]; total: number; pagina: number; tamano: number }
/** Detalle de un reporte para el personal. */
export interface ReporteDetalle extends ReporteResumen {
  latitud: number | null; longitud: number | null; descripcion: string; motivoDescarte: string | null;
  historial: { estatus: string; comentario: string | null; autor: string | null; fecha: string }[];
  transicionesPermitidas: string[];
}
/** Perfil y permisos del personal (D-18). */
export interface Perfil { correo: string; perfil: string; grupos: string[]; permisos: { permiso: string; descripcion: string }[] }
/** Resumen del panel (solo agregados). */
export interface ResumenEstadisticas {
  total: number; nuevosUltimos7Dias: number; sinMunicipio: number;
  porEstatus: { etiqueta: string; total: number }[]; porMes: { etiqueta: string; total: number }[];
}

/** Datos del formulario de reporte. */
export interface NuevoReporte {
  ubicacion: string; municipioId?: number; cantidadNinos: number; edadAproximada: string; actividad: string;
  situacionRiesgo: string; descripcion: string; avisoPrivacidadVersion: string;
}

/** Arma una cadena de consulta omitiendo valores vacíos. */
export function consulta(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
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
    llamar<{ accessToken: string; correo: string }>('/auth/login', { metodo: 'POST', cuerpo: { correo, password } }),
  perfil: () => llamar<Perfil>('/auth/perfil'),
  reportes: (f: { estatus?: string; municipioId?: number; pagina?: number }) =>
    llamar<Pagina<ReporteResumen>>(`/reportes${consulta({ ...f, tamano: 50 })}`),
  detalle: (id: number) => llamar<ReporteDetalle>(`/reportes/${id}`),
  cambiarEstatus: (id: number, estatus: string, comentario?: string, motivo?: string) =>
    llamar<ReporteDetalle>(`/reportes/${id}/estatus`, {
      metodo: 'PATCH', cuerpo: { estatus, comentario: comentario || undefined, motivo: motivo || undefined },
    }),
  agregarNota: (id: number, comentario: string) =>
    llamar<ReporteDetalle>(`/reportes/${id}/seguimientos`, { metodo: 'POST', cuerpo: { comentario } }),
  estadisticas: (f: { desde?: string; hasta?: string; municipioId?: number }) =>
    llamar<ResumenEstadisticas>(`/estadisticas/resumen${consulta(f)}`),
};
