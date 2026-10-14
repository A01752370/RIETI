import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/roles';

/**
 * Versión vigente del aviso de privacidad. `POST /reportes` exige que el
 * cliente envíe exactamente esta versión, como constancia de que la persona
 * la vio y aceptó (RF-44, RNF-26).
 */
export const AVISO_PRIVACIDAD_VERSION = '2026-10-v2';

/** Sección del aviso: título y sus párrafos. */
export interface SeccionAviso {
  /** Título corto de la sección. */
  titulo: string;
  /** Párrafos de la sección, en orden. */
  parrafos: string[];
}

/**
 * Aviso de privacidad simplificado, por secciones.
 *
 * BORRADOR para la demo: el texto definitivo lo debe validar el área jurídica
 * del SIPINNA municipal antes de publicar la app (ver docs/ESTADO-ENTREGA.md).
 * `2026-10-v2` (Fase 2) agrega la sección "Mapa y dirección" y ajusta "Tu reporte
 * es anónimo". Cambiar el contenido exige una versión nueva.
 */
export const AVISO_PRIVACIDAD_SECCIONES: readonly SeccionAviso[] = [
  {
    titulo: 'Quién es responsable',
    parrafos: [
      'El Sistema Municipal de Protección Integral de Niñas, Niños y Adolescentes (SIPINNA) de Atizapán de Zaragoza es responsable del tratamiento de los datos que proporciones en RIETI.',
    ],
  },
  {
    titulo: 'Para qué usamos tu reporte',
    parrafos: ['Usamos tu reporte únicamente para revisar y dar seguimiento a posibles situaciones de trabajo infantil en la Ruta Intermunicipal.'],
  },
  {
    titulo: 'Tu reporte es anónimo',
    parrafos: [
      'Tu reporte es anónimo: no pedimos tu nombre ni tus datos de contacto, y la app no envía identificadores de tu dispositivo. Solo se guarda la dirección del lugar de los hechos y, si la marcas, su ubicación en el mapa.',
    ],
  },
  {
    titulo: 'Mapa y dirección',
    parrafos: [
      'Si marcas el lugar en el mapa o usas tu ubicación actual, ese punto se guarda como lugar de los hechos (no como tu ubicación) y solo lo ve el personal autorizado del SIPINNA.',
      'Para sugerirte la dirección y mostrarte el mapa, nuestro servidor consulta el servicio de mapas OpenStreetMap con el punto aproximado. Tu teléfono no se comunica directamente con ese servicio, así que no recibe tu dirección IP ni datos de tu dispositivo.',
    ],
  },
  {
    titulo: 'Protege a la niña, niño o adolescente',
    parrafos: ['No escribas el nombre, la CURP ni el domicilio de la niña, niño o adolescente.'],
  },
  {
    titulo: 'Qué no es este reporte',
    parrafos: ['Este reporte no es una denuncia formal ante el Ministerio Público. Si hay peligro inmediato, llama al 911.'],
  },
  {
    titulo: 'Tu folio y tu clave',
    parrafos: ['Al enviar recibirás un folio y una clave de consulta. Guárdalos: la clave no se puede recuperar.'],
  },
];

/** Todos los párrafos en orden (formato anterior, que usan las APK instaladas). */
export const AVISO_PRIVACIDAD_TEXTO: string[] = AVISO_PRIVACIDAD_SECCIONES.flatMap((s) => s.parrafos);

/** Respuesta de `GET /api/v1/avisos-privacidad/vigente`. */
export interface AvisoPrivacidadDto {
  /** Versión que el cliente debe enviar en `avisoPrivacidadVersion`. */
  version: string;
  /** Párrafos del aviso, en orden (se conserva por compatibilidad). */
  parrafos: string[];
  /** El mismo texto agrupado en secciones con título, para mostrarlo con mejor formato. */
  secciones: readonly SeccionAviso[];
}

/** Publica el aviso de privacidad vigente. */
@Controller('avisos-privacidad')
export class AvisosController {
  /** Aviso vigente. Público: se muestra antes de capturar el reporte (CU-02). */
  @Publico()
  @Get('vigente')
  vigente(): AvisoPrivacidadDto {
    return { version: AVISO_PRIVACIDAD_VERSION, parrafos: AVISO_PRIVACIDAD_TEXTO, secciones: AVISO_PRIVACIDAD_SECCIONES };
  }
}
