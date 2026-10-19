import {
  Body, Controller, Get, HttpCode, Inject, Injectable, NotFoundException, Param, ParseIntPipe, Post, Req, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsUUID, Max, Min } from 'class-validator';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { alcanceDe, exigirAlcance, registrarAcceso } from '../auth/alcance';
import { RequestAutenticado } from '../auth/jwt.guard';
import { Publico, Requiere } from '../auth/roles';
import { ConsultarReporteDto } from '../reportes/reporte.dto';
import { ReportesService } from '../reportes/reportes.service';
import { ALMACEN_FOTOS, AlmacenFotos, SubidaPrefirmada } from './almacen';
import { formatoReal, MAX_BYTES_FOTO, MAX_FOTOS_POR_REPORTE, recodificar } from './imagen';

/** Horas después del alta en las que quien reportó puede agregar fotos. */
export const VENTANA_FOTOS_HORAS = 24;
/** Vigencia del formulario de subida directa (segundos). */
export const SEGUNDOS_SUBIDA = 300;
/** Vigencia de la URL de lectura para el personal (segundos). */
export const SEGUNDOS_LECTURA = 60;

/** Cuerpo de `POST /api/v1/reportes/fotos/solicitud` (Fase 8). */
export class SolicitarFotosDto extends ConsultarReporteDto {
  /** Fotos que se van a subir (1 a 3, contando las que ya tenga el reporte). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FOTOS_POR_REPORTE)
  cantidad: number;
}

/** Cuerpo de `POST /api/v1/reportes/fotos/confirmar` (Fase 8). */
export class ConfirmarFotosDto extends ConsultarReporteDto {
  /** Identificadores que devolvió la solicitud, de las fotos ya subidas. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FOTOS_POR_REPORTE)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids: string[];
}

/** Respuesta de la solicitud: un formulario de subida por foto. */
export interface SolicitudFotosDto {
  subidas: (SubidaPrefirmada & { id: string })[];
  maxBytes: number;
  expiraEnSegundos: number;
}

/** Foto para el personal: solo una URL de lectura de corta duración. */
export interface FotoDto {
  id: number;
  url: string;
  expiraEnSegundos: number;
  ancho: number;
  alto: number;
  bytes: number;
  fecha: string;
}

const error = (codigo: string, mensaje: string) => new UnprocessableEntityException({ codigo, mensaje });

/**
 * Evidencia fotográfica opcional (Fase 8, D-42). Quien reportó la sube con su folio y clave
 * (mismas protecciones que la consulta) directo a la zona de entrada privada; el servidor
 * valida el tipo real, re-codifica sin metadatos y guarda con nombre aleatorio. El personal
 * la ve con una URL prefirmada de 60 s que queda en la bitácora de accesos.
 */
@Injectable()
export class FotosService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly reportes: ReportesService,
    @Inject(ALMACEN_FOTOS) private readonly almacen: AlmacenFotos,
  ) {}

  /** Verifica folio + clave, la ventana de tiempo y el cupo; devuelve el reporte y las fotos que tiene. */
  private async reporteDelCiudadano(folio: string, clave: string): Promise<{ id: number; existentes: number }> {
    const id = await this.reportes.verificarFolioClave(folio, clave);
    const [fila] = await this.ds.query(
      `SELECT r.fecha_creacion >= now() - make_interval(hours => $2::int) AS a_tiempo,
              (SELECT count(*)::int FROM foto_reporte f WHERE f.id_reporte = r.id_reporte) AS existentes
       FROM reporte r WHERE r.id_reporte = $1`, [id, VENTANA_FOTOS_HORAS]);
    if (!fila.a_tiempo) throw error('FUERA_DE_TIEMPO', `Las fotos solo se pueden agregar en las ${VENTANA_FOTOS_HORAS} horas siguientes al reporte`);
    return { id, existentes: fila.existentes };
  }

  async solicitar(dto: SolicitarFotosDto): Promise<SolicitudFotosDto> {
    const { id, existentes } = await this.reporteDelCiudadano(dto.folio, dto.clave);
    if (existentes + dto.cantidad > MAX_FOTOS_POR_REPORTE) {
      throw error('LIMITE_FOTOS', `Un reporte puede tener hasta ${MAX_FOTOS_POR_REPORTE} fotos; este ya tiene ${existentes}`);
    }
    const subidas = await Promise.all(Array.from({ length: dto.cantidad }, async () => {
      const idSubida = randomUUID();
      return { id: idSubida, ...(await this.almacen.subida(`entrantes/${id}/${idSubida}`, MAX_BYTES_FOTO, SEGUNDOS_SUBIDA)) };
    }));
    return { subidas, maxBytes: MAX_BYTES_FOTO, expiraEnSegundos: SEGUNDOS_SUBIDA };
  }

  /**
   * Valida y re-codifica cada foto subida. Lo que no es JPEG/PNG/WebP real, está dañado o
   * excede el tamaño se descarta (y se borra de la zona de entrada) con un error claro.
   */
  async confirmar(dto: ConfirmarFotosDto): Promise<{ fotos: number }> {
    const { id } = await this.reporteDelCiudadano(dto.folio, dto.clave);
    const listas: { clave: string; entrante: string; bytes: number; ancho: number; alto: number; sha256: string }[] = [];
    for (const idSubida of dto.ids) {
      const entrante = `entrantes/${id}/${idSubida}`;
      const original = await this.almacen.leer(entrante, MAX_BYTES_FOTO);
      if (!original) throw error('FOTO_NO_ENCONTRADA', 'No encontramos una de las fotos o pesa más de 5 MB. Vuelve a intentarlo');
      if (!formatoReal(original)) {
        await this.almacen.borrar(entrante);
        throw error('TIPO_NO_PERMITIDO', 'Solo se aceptan fotos JPG, PNG o WebP');
      }
      let imagen;
      try {
        imagen = await recodificar(original);
      } catch {
        await this.almacen.borrar(entrante);
        throw error('IMAGEN_INVALIDA', 'Una de las fotos está dañada o es demasiado grande');
      }
      const clave = `fotos/${randomUUID()}.jpg`;
      await this.almacen.guardar(clave, imagen.datos, 'image/jpeg');
      listas.push({ clave, entrante, bytes: imagen.datos.length, ancho: imagen.ancho, alto: imagen.alto, sha256: imagen.sha256 });
    }
    const total = await this.ds.transaction(async (m) => {
      await m.query('SELECT 1 FROM reporte WHERE id_reporte = $1 FOR UPDATE', [id]);
      const [{ n }] = await m.query('SELECT count(*)::int AS n FROM foto_reporte WHERE id_reporte = $1', [id]);
      if (n + listas.length > MAX_FOTOS_POR_REPORTE) throw error('LIMITE_FOTOS', `Un reporte puede tener hasta ${MAX_FOTOS_POR_REPORTE} fotos`);
      for (const f of listas) {
        await m.query('INSERT INTO foto_reporte (id_reporte, clave_objeto, bytes, ancho, alto, sha256) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, f.clave, f.bytes, f.ancho, f.alto, f.sha256]);
      }
      return n + listas.length;
    });
    await Promise.all(listas.map((f) => this.almacen.borrar(f.entrante)));
    return { fotos: total };
  }

  /** Fotos de un reporte para el personal, con URL de 60 s y registro en la bitácora de accesos. */
  async listar(idReporte: number, req: RequestAutenticado): Promise<FotoDto[]> {
    const alcance = await alcanceDe(this.ds, req.usuario!);
    const [r] = await this.ds.query(
      'SELECT r.id_municipio, f.codigo AS folio FROM reporte r JOIN folio f ON f.id_reporte = r.id_reporte WHERE r.id_reporte = $1', [idReporte]);
    if (!r) throw new NotFoundException('Reporte no encontrado');
    exigirAlcance(alcance, r.id_municipio);
    const fotos: { id: number; clave_objeto: string; ancho: number; alto: number; bytes: number; fecha: Date }[] = await this.ds.query(
      'SELECT id_foto AS id, clave_objeto, ancho, alto, bytes, fecha FROM foto_reporte WHERE id_reporte = $1 ORDER BY id_foto', [idReporte]);
    if (fotos.length > 0) await registrarAcceso(this.ds, alcance.idUsuario, 'foto', { id: idReporte, folio: r.folio }, `${fotos.length} foto(s)`);
    return Promise.all(fotos.map(async (f) => ({
      id: Number(f.id), url: await this.almacen.urlLectura(f.clave_objeto, SEGUNDOS_LECTURA), expiraEnSegundos: SEGUNDOS_LECTURA,
      ancho: f.ancho, alto: f.alto, bytes: f.bytes, fecha: new Date(f.fecha).toISOString(),
    })));
  }
}

/** Rutas de fotos (Fase 8). Deben declararse antes de `reportes/:id` para no confundirse con un id. */
@Controller('reportes')
export class FotosController {
  constructor(private readonly fotos: FotosService) {}

  /** Pide formularios de subida directa (5 min, ≤ 5 MB). Pública con folio + clave; 10 por minuto por IP. */
  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('fotos/solicitud')
  @HttpCode(200)
  solicitar(@Body() dto: SolicitarFotosDto): Promise<SolicitudFotosDto> {
    return this.fotos.solicitar(dto);
  }

  /** Confirma las fotos subidas: validación por contenido y re-codificación sin metadatos. 10 por minuto por IP. */
  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('fotos/confirmar')
  @HttpCode(200)
  confirmar(@Body() dto: ConfirmarFotosDto): Promise<{ fotos: number }> {
    return this.fotos.confirmar(dto);
  }

  /** Fotos del reporte para el personal: URL prefirmada de 60 s; queda en la bitácora de accesos. */
  @Requiere('reportes.ver')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':id/fotos')
  listar(@Param('id', ParseIntPipe) id: number, @Req() req: RequestAutenticado): Promise<FotoDto[]> {
    return this.fotos.listar(id, req);
  }
}
