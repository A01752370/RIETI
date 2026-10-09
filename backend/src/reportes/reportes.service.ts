import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Actividad, EstatusReporte, RangoEdad, Riesgo } from '../catalogos/catalogo.entities';
import { Usuario } from '../auth/usuario.entity';
import { Caso, Folio, Reporte, ReporteCaso, Seguimiento, Ubicacion } from './reporte.entities';
import { ActualizarReporteDto, CrearReporteDto, ReporteRespuestaDto } from './reporte.dto';

const ESTATUS_INICIAL = 'Recibido';
const LIMITE_LISTADO = 500;

/** Formatea el folio público: RIETI-2026-000042. */
export function formatearFolio(anio: number, consecutivo: number): string {
  return `RIETI-${anio}-${String(consecutivo).padStart(6, '0')}`;
}

/**
 * Versión para consulta ciudadana anónima por folio: solo estatus y fechas.
 * Los folios son secuenciales, así que sin esto cualquiera podría enumerar
 * reportes y obtener ubicación y descripción de casos de menores.
 */
export function redactarParaCiudadano(r: ReporteRespuestaDto): ReporteRespuestaDto {
  return { ...r, ubicacion: '', latitud: null, longitud: null, descripcion: '', comentarioAdmin: null };
}

@Injectable()
export class ReportesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async crear(dto: CrearReporteDto): Promise<ReporteRespuestaDto> {
    const id = await this.ds.transaction(async (m) => {
      const [actividad, riesgo, rangoEdad, estatus] = await Promise.all([
        this.catalogo(m, Actividad, dto.actividad, 'actividad'),
        this.catalogo(m, Riesgo, dto.situacionRiesgo, 'situacionRiesgo'),
        this.catalogo(m, RangoEdad, dto.edadAproximada, 'edadAproximada'),
        this.catalogo(m, EstatusReporte, ESTATUS_INICIAL, 'estatus'),
      ]);

      const reporte = await m.save(m.create(Reporte, {
        ubicacion: m.create(Ubicacion, {
          descripcion: dto.ubicacion.trim(),
          latitud: dto.latitud ?? null,
          longitud: dto.longitud ?? null,
        }),
        actividad, riesgo, rangoEdad,
        cantidadNinos: dto.cantidadNinos,
        descripcion: dto.descripcion.trim(),
      }));

      // Consecutivo anual atómico (sin carreras entre peticiones concurrentes).
      const anio = new Date().getFullYear();
      const [{ ultimo }] = await m.query(
        `INSERT INTO folio_contador (anio, ultimo) VALUES ($1, 1)
         ON CONFLICT (anio) DO UPDATE SET ultimo = folio_contador.ultimo + 1
         RETURNING ultimo`, [anio]);
      await m.save(m.create(Folio, { reporte, anio, consecutivo: ultimo, codigo: formatearFolio(anio, ultimo) }));

      const caso = await m.save(m.create(Caso, { estatus }));
      await m.save(m.create(ReporteCaso, { idReporte: reporte.id, idCaso: caso.id }));
      await m.save(m.create(Seguimiento, { caso, estatus, comentario: null, usuario: null }));
      return reporte.id;
    });
    return this.obtener(id);
  }

  async listar(): Promise<ReporteRespuestaDto[]> {
    const reportes = await this.ds.getRepository(Reporte).find({
      order: { fechaCreacion: 'DESC' },
      take: LIMITE_LISTADO,
    });
    return this.aplanar(reportes);
  }

  async obtener(id: number): Promise<ReporteRespuestaDto> {
    const reporte = await this.ds.getRepository(Reporte).findOneBy({ id });
    if (!reporte) throw new NotFoundException('Reporte no encontrado');
    return (await this.aplanar([reporte]))[0];
  }

  async buscarPorFolio(codigo: string): Promise<ReporteRespuestaDto> {
    const folio = await this.ds.getRepository(Folio).findOne({
      where: { codigo: codigo.trim().toUpperCase() },
      relations: { reporte: true },
    });
    if (!folio) throw new NotFoundException('Folio no encontrado');
    return this.obtener(folio.reporte.id);
  }

  async actualizar(id: number, dto: ActualizarReporteDto, usuario: Usuario | null): Promise<ReporteRespuestaDto> {
    await this.ds.transaction(async (m) => {
      const rc = await m.findOne(ReporteCaso, { where: { idReporte: id } });
      if (!rc) throw new NotFoundException('Reporte no encontrado');
      const estatus = await this.catalogo(m, EstatusReporte, dto.estatus, 'estatus');

      rc.caso.estatus = estatus;
      await m.save(rc.caso);
      await m.save(m.create(Seguimiento, {
        caso: rc.caso, estatus, usuario,
        comentario: dto.comentarioAdmin.trim() || null,
      }));
      await m.update(Reporte, { id }, { fechaActualizacion: () => 'now()' });
    });
    return this.obtener(id);
  }

  /** Busca un valor de catálogo por nombre; 400 si no existe. */
  private async catalogo<T extends { nombre: string }>(
    m: EntityManager, entidad: new () => T, nombre: string, campo: string,
  ): Promise<T> {
    const valor = await m.findOne(entidad, { where: { nombre: nombre.trim() } as never });
    if (!valor) throw new BadRequestException(`Valor no válido para ${campo}: "${nombre}"`);
    return valor;
  }

  /** Junta folio, caso/estatus y último comentario en el DTO plano de la app. */
  private async aplanar(reportes: Reporte[]): Promise<ReporteRespuestaDto[]> {
    if (reportes.length === 0) return [];
    const ids = reportes.map((r) => r.id);

    const [folios, relaciones] = await Promise.all([
      this.ds.getRepository(Folio).find({ where: { reporte: { id: In(ids) } }, relations: { reporte: true } }),
      this.ds.getRepository(ReporteCaso).find({ where: { idReporte: In(ids) } }),
    ]);
    const casoIds = [...new Set(relaciones.map((rc) => rc.idCaso))];
    const comentarios: { id_caso: number; comentario: string }[] = casoIds.length === 0 ? [] : await this.ds.query(
      `SELECT DISTINCT ON (id_caso) id_caso, comentario FROM seguimiento
       WHERE id_caso = ANY($1) AND comentario IS NOT NULL
       ORDER BY id_caso, fecha DESC, id_seguimiento DESC`, [casoIds]);

    const folioPor = new Map(folios.map((f) => [f.reporte.id, f.codigo]));
    const casoPor = new Map(relaciones.map((rc) => [rc.idReporte, rc.caso]));
    const comentarioPor = new Map(comentarios.map((c) => [c.id_caso, c.comentario]));

    return reportes.map((r) => {
      const caso = casoPor.get(r.id);
      return {
        id: r.id,
        folio: folioPor.get(r.id) ?? '',
        ubicacion: r.ubicacion.descripcion,
        latitud: r.ubicacion.latitud,
        longitud: r.ubicacion.longitud,
        cantidadNinos: r.cantidadNinos,
        edadAproximada: r.rangoEdad.nombre,
        actividad: r.actividad.nombre,
        situacionRiesgo: r.riesgo.nombre,
        descripcion: r.descripcion,
        estatus: caso?.estatus.nombre ?? ESTATUS_INICIAL,
        comentarioAdmin: (caso && comentarioPor.get(caso.id)) ?? null,
        fechaCreacion: r.fechaCreacion.toISOString(),
        fechaActualizacion: r.fechaActualizacion.toISOString(),
      };
    });
  }
}
