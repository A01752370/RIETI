import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

/** Formato único de error del API (`CLAUDE.md`, plan §6). */
export interface ErrorApi {
  /** Código estable en MAYÚSCULAS que la app puede usar para decidir qué mostrar. */
  codigo: string;
  /** Mensaje en español, apto para mostrarse al usuario. */
  mensaje: string;
  /** Detalle opcional (p. ej. la lista de errores de validación). */
  detalle?: string[];
}

/** Código por defecto según el estatus HTTP, cuando la excepción no trae uno propio. */
const CODIGO_POR_ESTATUS: Record<number, string> = {
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'PROHIBIDO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  413: 'CUERPO_DEMASIADO_GRANDE',
  422: 'NO_PROCESABLE',
  429: 'DEMASIADOS_INTENTOS',
  503: 'NO_DISPONIBLE',
};

/** Mensaje por defecto según el estatus HTTP. */
const MENSAJE_POR_ESTATUS: Record<number, string> = {
  401: 'Inicia sesión para continuar',
  403: 'No tienes permiso para esta acción',
  404: 'No se encontró el recurso',
  429: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo',
};

/**
 * Convierte cualquier excepción en `{codigo, mensaje, detalle?}`.
 *
 * Los errores no controlados se registran con su traza, pero al cliente solo
 * llega un mensaje genérico: nunca se filtran detalles internos ni datos del
 * cuerpo de la petición (que puede contener información sensible).
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger(FiltroErrores.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { estatus, cuerpo } = convertirError(excepcion);
    if (estatus >= 500) {
      this.logger.error(excepcion instanceof Error ? excepcion.stack ?? excepcion.message : String(excepcion));
    }
    res.status(estatus).json(cuerpo);
  }
}

/**
 * Lógica pura del filtro (separada para poder probarla sin Nest).
 * @returns estatus HTTP y cuerpo con el formato único de error
 */
export function convertirError(excepcion: unknown): { estatus: number; cuerpo: ErrorApi } {
  // Errores de body-parser (http-errors): cuerpo demasiado grande o JSON mal formado.
  const e = excepcion as { status?: unknown; expose?: unknown; type?: unknown } | null;
  if (!(excepcion instanceof HttpException) && typeof e?.status === 'number' && e.status < 500 && e.expose === true) {
    if (e.type === 'entity.too.large') {
      return { estatus: 413, cuerpo: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'La solicitud es demasiado grande' } };
    }
    return { estatus: 400, cuerpo: { codigo: 'SOLICITUD_INVALIDA', mensaje: 'El cuerpo de la solicitud no es JSON válido' } };
  }
  if (!(excepcion instanceof HttpException)) {
    return { estatus: 500, cuerpo: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } };
  }
  const estatus = excepcion.getStatus();
  const r = excepcion.getResponse();
  const obj = (typeof r === 'object' && r !== null ? r : { message: r }) as Record<string, unknown>;

  const codigo = typeof obj.codigo === 'string' ? obj.codigo : CODIGO_POR_ESTATUS[estatus] ?? `HTTP_${estatus}`;
  let mensaje = typeof obj.mensaje === 'string' ? obj.mensaje : undefined;
  let detalle: string[] | undefined;

  // ValidationPipe devuelve `message: string[]` con cada regla incumplida.
  if (Array.isArray(obj.message)) {
    detalle = obj.message.map(String);
    mensaje ??= 'Hay datos inválidos en la solicitud';
  } else if (typeof obj.message === 'string' && typeof obj.error === 'string' && estatus < 500
    // "Cannot GET /ruta" es el texto en inglés de Express para rutas inexistentes.
    && !/^Cannot [A-Z]+ /.test(obj.message)) {
    // Nest pone `error` solo cuando el código pasó un mensaje propio
    // (p. ej. `new NotFoundException('Reporte no encontrado')`); si no, `message`
    // es la frase genérica en inglés y preferimos la nuestra.
    mensaje ??= obj.message;
  }
  mensaje ??= MENSAJE_POR_ESTATUS[estatus] ?? (estatus >= 500 ? 'Ocurrió un error inesperado' : 'Solicitud inválida');

  return { estatus, cuerpo: detalle ? { codigo, mensaje, detalle } : { codigo, mensaje } };
}
