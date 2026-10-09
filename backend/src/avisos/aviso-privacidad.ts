import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/roles';

/**
 * Versión vigente del aviso de privacidad. `POST /reportes` exige que el
 * cliente envíe exactamente esta versión, como constancia de que la persona
 * la vio y aceptó (RF-44, RNF-26).
 */
export const AVISO_PRIVACIDAD_VERSION = '2026-10-v1';

/**
 * Aviso de privacidad simplificado.
 *
 * BORRADOR para la demo: el texto definitivo lo debe validar el área jurídica
 * del SIPINNA municipal antes de publicar la app (ver docs/ESTADO-ENTREGA.md).
 */
export const AVISO_PRIVACIDAD_TEXTO = [
  'El Sistema Municipal de Protección Integral de Niñas, Niños y Adolescentes (SIPINNA) de Atizapán de Zaragoza es responsable del tratamiento de los datos que proporciones en RIETI.',
  'Usamos tu reporte únicamente para revisar y dar seguimiento a posibles situaciones de trabajo infantil en la Ruta Intermunicipal.',
  'Tu reporte es anónimo: no pedimos tu nombre ni tus datos de contacto, y la app no envía la ubicación de tu teléfono ni identificadores de tu dispositivo. Solo se guarda la ubicación del lugar de los hechos que tú indiques.',
  'No escribas el nombre, la CURP ni el domicilio de la niña, niño o adolescente.',
  'Este reporte no es una denuncia formal ante el Ministerio Público. Si hay peligro inmediato, llama al 911.',
  'Al enviar recibirás un folio y una clave de consulta. Guárdalos: la clave no se puede recuperar.',
];

/** Respuesta de `GET /api/v1/avisos-privacidad/vigente`. */
export interface AvisoPrivacidadDto {
  /** Versión que el cliente debe enviar en `avisoPrivacidadVersion`. */
  version: string;
  /** Párrafos del aviso, en orden. */
  parrafos: string[];
}

/** Publica el aviso de privacidad vigente. */
@Controller('avisos-privacidad')
export class AvisosController {
  /** Aviso vigente. Público: se muestra antes de capturar el reporte (CU-02). */
  @Publico()
  @Get('vigente')
  vigente(): AvisoPrivacidadDto {
    return { version: AVISO_PRIVACIDAD_VERSION, parrafos: AVISO_PRIVACIDAD_TEXTO };
  }
}
