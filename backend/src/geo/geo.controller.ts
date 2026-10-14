import { Controller, Get, Header, Param, ParseIntPipe, Query, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';
import { Publico } from '../auth/roles';
import { GeoReversaDto, GeoService } from './geo.service';

/** Parámetros de `GET /api/v1/geo/reversa`. */
export class ReversaQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;
}

/**
 * Geografía para el formulario (Fase 2). Rutas **públicas** porque se usan
 * antes de enviar un reporte anónimo; están limitadas a la cobertura del Estado
 * de México y con límite de tasa propio.
 */
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  /**
   * Dirección sugerida y municipio donde cae el punto del mapa.
   * 30 por minuto por IP: se llama al soltar el marcador, no por cada tecla.
   */
  @Publico()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('reversa')
  reversa(@Query() q: ReversaQueryDto): Promise<GeoReversaDto> {
    return this.geo.reversa(q.lat, q.lng);
  }

  /**
   * Tesela del mapa (PNG), servida desde el backend para que la app no contacte
   * a terceros. 600 por minuto por IP (mover el mapa pide varias a la vez).
   */
  @Publico()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=86400')
  @Get('teselas/:z/:x/:y.png')
  async tesela(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.geo.tesela(z, x, y));
  }
}
