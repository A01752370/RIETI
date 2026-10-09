import {
  BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Actividad, EstatusReporte, RangoEdad, Riesgo } from '../catalogos/catalogo.entities';
import { Usuario } from '../auth/usuario.entity';
import { Caso, Folio, Reporte, ReporteCaso, Seguimiento, Ubicacion } from './reporte.entities';
import {
  AgregarSeguimientoDto, CambiarEstatusDto, ConsultaPublicaDto, CrearReporteDto, EventoPublicoDto,
  EventoSeguimientoDto, ListarReportesDto, PaginaDto, ReporteCreadoDto, ReporteDetalleDto, ReporteResumenDto,
} from './reporte.dto';
import { generarClave, hashearClave, verificarClave } from './clave-consulta';
import { ESTATUS, ESTATUS_INICIAL, transicionesPermitidas, validarTransicion } from './estatus';
import { LimitadorIntentos } from './limitador-intentos';

/** Hash Argon2id de una clave que nadie conoce: se verifica cuando el folio no existe para igualar tiempos. */
const HASH_SENUELO = '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Formatea el folio público: RIETI-2026-000042. */
export function formatearFolio(anio: number, consecutivo: number): string {
  return `RIETI-${anio}-${String(consecutivo).padStart(6, '0')}`;
}

/**
 * Reduce la bitácora a la línea de tiempo pública: solo cambios de estatus
 * (las notas sin cambio de estatus y los comentarios internos no se exponen).
 */
export function lineaDeTiempoPublica(eventos: { estatus: string; fecha: Date }[]): EventoPublicoDto[] {
  const resultado: EventoPublicoDto[] = [];
  for (const e of eventos) {
    if (resultado.at(-1)?.estatus !== e.estatus) resultado.push({ estatus: e.estatus, fecha: e.fecha.toISOString() });
  }
  return resultado;
}

/** Error uniforme de la consulta pública: no revela si falló el folio o la clave (ataque A1). */
function errorConsulta(): NotFoundException {
  return new NotFoundException({ codigo: 'FOLIO_O_CLAVE_INCORRECTOS', mensaje: 'El folio o la clave no son correctos' });
}

/**
 * Lógica de negocio de reportes: registro anónimo, consulta ciudadana con
 * folio + clave, bandeja del personal y cambios de estatus con bitácora.
 *
 * Todas las consultas SQL son parametrizadas (TypeORM o `$n`), nunca concatenadas.
 */
@Injectable()
export class ReportesService {
  /** Intentos fallidos de consulta por folio (en memoria; ver {@link LimitadorIntentos}). */
  readonly limitador = new LimitadorIntentos();

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * CU-04: registra un reporte anónimo y abre su caso en estatus Recibido.
   * @returns folio y clave de consulta (la clave en claro solo existe en esta respuesta)
   */
  async crear(dto: CrearReporteDto): Promise<ReporteCreadoDto> {
    const claveConsulta = generarClave();
    const claveConsultaHash = await hashearClave(claveConsulta);

    const { codigo, fecha } = await this.ds.transaction(async (m) => {
      const [actividad, riesgo, rangoEdad, estatus] = await Promise.all([
        this.catalogo(m, Actividad, dto.actividad, 'actividad'),
        this.catalogo(m, Riesgo, dto.situacionRiesgo, 'situacionRiesgo'),
        this.catalogo(m, RangoEdad, dto.edadAproximada, 'edadAproximada'),
        this.catalogo(m, EstatusReporte, ESTATUS_INICIAL, 'estatus'),
      ]);

      const reporte = await m.save(m.create(Reporte, {
        ubicacion: m.create(Ubicacion, {
          descripcion: dto.ubicacion,
          latitud: dto.latitud ?? null,
          longitud: dto.longitud ?? null,
        }),
        actividad, riesgo, rangoEdad,
        cantidadNinos: dto.cantidadNinos,
        descripcion: dto.descripcion,
        claveConsultaHash,
        avisoPrivacidadVersion: dto.avisoPrivacidadVersion,
      }));

      // Consecutivo anual atómico (sin carreras entre peticiones concurrentes).
      const anio = new Date().getFullYear();
      const [{ ultimo }] = await m.query(
        `INSERT INTO folio_contador (anio, ultimo) VALUES ($1, 1)
         ON CONFLICT (anio) DO UPDATE SET ultimo = folio_contador.ultimo + 1
         RETURNING ultimo`, [anio]);
      const folio = formatearFolio(anio, ultimo);
      await m.save(m.create(Folio, { reporte, anio, consecutivo: ultimo, codigo: folio }));

      const caso = await m.save(m.create(Caso, { estatus }));
      await m.save(m.create(ReporteCaso, { idReporte: reporte.id, idCaso: caso.id }));
      await m.save(m.create(Seguimiento, { caso, estatus, comentario: null, usuario: null }));
      return { codigo: folio, fecha: reporte.fechaCreacion };
    });

    return { folio: codigo, claveConsulta, estatus: ESTATUS_INICIAL, fechaCreacion: fecha.toISOString() };
  }

  /**
   * CU-08: consulta ciudadana con folio + clave (RF-38, RF-47).
   *
   * Responde igual si el folio no existe o si la clave es incorrecta, y bloquea
   * el folio tras 5 fallos en 15 minutos. Solo devuelve estatus y fechas.
   *
   * @throws NotFoundException `FOLIO_O_CLAVE_INCORRECTOS`
   * @throws HttpException 429 `DEMASIADOS_INTENTOS`
   */
  async consultar(folio: string, clave: string): Promise<ConsultaPublicaDto> {
    if (this.limitador.estaBloqueado(folio)) {
      throw new HttpException(
        { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos con este folio. Espera 15 minutos e inténtalo de nuevo' },
        HttpStatus.TOO_MANY_REQUESTS);
    }

    const fila = await this.ds.getRepository(Folio).createQueryBuilder('f')
      .innerJoin('f.reporte', 'r')
      .select(['f.id', 'r.id'])
      .addSelect('r.claveConsultaHash')
      .where('f.codigo = :folio', { folio })
      .getRawOne<{ r_id_reporte: number; r_clave_consulta_hash: string | null }>();

    // Si el folio no existe se verifica contra un hash señuelo para que el tiempo de respuesta no lo delate.
    const valida = await verificarClave(clave, fila?.r_clave_consulta_hash ?? HASH_SENUELO);
    if (!fila || !fila.r_clave_consulta_hash || !valida) {
      this.limitador.registrarFallo(folio);
      throw errorConsulta();
    }
    this.limitador.reiniciar(folio);

    const reporte = await this.resumen(fila.r_id_reporte);
    const eventos = await this.bitacora(fila.r_id_reporte);
    return {
      folio: reporte.folio,
      estatus: reporte.estatus,
      fechaCreacion: reporte.fechaCreacion,
      fechaActualizacion: reporte.fechaActualizacion,
      historial: lineaDeTiempoPublica(eventos.map((e) => ({ estatus: e.estatus, fecha: new Date(e.fecha) }))),
    };
  }

  /** CU-09: bandeja del personal, del más reciente al más antiguo, con filtro por estatus. */
  async listar({ estatus, pagina, tamano }: ListarReportesDto): Promise<PaginaDto<ReporteResumenDto>> {
    const filtro = estatus ?? null;
    const desde = `
      FROM reporte r
      JOIN reporte_caso rc ON rc.id_reporte = r.id_reporte
      JOIN caso c ON c.id_caso = rc.id_caso
      JOIN estatus_reporte e ON e.id_estatus = c.id_estatus
      WHERE ($1::text IS NULL OR e.nombre = $1::text)`;
    const [{ total }] = await this.ds.query(`SELECT count(DISTINCT r.id_reporte)::int AS total ${desde}`, [filtro]);
    const filas: { id: number }[] = await this.ds.query(
      `SELECT DISTINCT r.id_reporte AS id, r.fecha_creacion ${desde}
       ORDER BY r.fecha_creacion DESC, r.id_reporte DESC
       LIMIT $2 OFFSET $3`, [filtro, tamano, (pagina - 1) * tamano]);

    const ids = filas.map((f) => Number(f.id));
    const reportes = ids.length === 0 ? [] : await this.ds.getRepository(Reporte).findBy({ id: In(ids) });
    const porId = new Map((await this.aplanar(reportes)).map((r) => [r.id, r]));
    return { elementos: ids.map((id) => porId.get(id)!).filter(Boolean), total, pagina, tamano };
  }

  /** CU-09: detalle completo con bitácora y transiciones permitidas. */
  async detalle(id: number): Promise<ReporteDetalleDto> {
    const reporte = await this.ds.getRepository(Reporte).findOneBy({ id });
    if (!reporte) throw new NotFoundException('Reporte no encontrado');
    const [resumen] = await this.aplanar([reporte]);
    const rc = await this.ds.getRepository(ReporteCaso).findOneBy({ idReporte: id });
    return {
      ...resumen,
      latitud: reporte.ubicacion.latitud,
      longitud: reporte.ubicacion.longitud,
      descripcion: reporte.descripcion,
      motivoDescarte: rc?.caso.motivoDescarte ?? null,
      historial: await this.bitacora(id),
      transicionesPermitidas: transicionesPermitidas(resumen.estatus),
    };
  }

  /**
   * CU-09/CU-10: cambia el estatus validando la máquina de estados y deja
   * constancia en la bitácora (append-only).
   *
   * @throws UnprocessableEntityException transición inválida o falta motivo/comentario
   */
  async cambiarEstatus(id: number, dto: CambiarEstatusDto, idUsuario: number): Promise<ReporteDetalleDto> {
    await this.ds.transaction(async (m) => {
      const rc = await m.findOne(ReporteCaso, { where: { idReporte: id } });
      if (!rc) throw new NotFoundException('Reporte no encontrado');
      // Bloquea la fila del caso para que dos personas no cambien el estatus a la vez.
      await m.query('SELECT 1 FROM caso WHERE id_caso = $1 FOR UPDATE', [rc.idCaso]);
      const caso = await m.findOneByOrFail(Caso, { id: rc.idCaso });

      const error = validarTransicion(caso.estatus.nombre, dto.estatus, dto.comentario, dto.motivo);
      if (error) throw new UnprocessableEntityException(error);

      const estatus = await this.catalogo(m, EstatusReporte, dto.estatus, 'estatus');
      caso.estatus = estatus;
      if (dto.estatus === ESTATUS.DESCARTADO) caso.motivoDescarte = dto.motivo!;
      await m.save(caso);

      const nota = [dto.comentario, dto.estatus === ESTATUS.DESCARTADO ? `Motivo de descarte: ${dto.motivo}` : null]
        .filter((t) => t?.trim()).join('\n') || null;
      await m.save(m.create(Seguimiento, { caso, estatus, comentario: nota, usuario: { id: idUsuario } as Usuario }));
      await m.update(Reporte, { id }, { fechaActualizacion: () => 'now()' });
    });
    return this.detalle(id);
  }

  /** Agrega una nota de seguimiento sin cambiar el estatus. */
  async agregarSeguimiento(id: number, dto: AgregarSeguimientoDto, idUsuario: number): Promise<ReporteDetalleDto> {
    await this.ds.transaction(async (m) => {
      const rc = await m.findOne(ReporteCaso, { where: { idReporte: id } });
      if (!rc) throw new NotFoundException('Reporte no encontrado');
      await m.save(m.create(Seguimiento, {
        caso: rc.caso, estatus: rc.caso.estatus, comentario: dto.comentario, usuario: { id: idUsuario } as Usuario,
      }));
      await m.update(Reporte, { id }, { fechaActualizacion: () => 'now()' });
    });
    return this.detalle(id);
  }

  /** Busca un valor de catálogo por nombre; 400 si no existe. */
  private async catalogo<T extends { nombre: string }>(
    m: EntityManager, entidad: new () => T, nombre: string, campo: string,
  ): Promise<T> {
    const valor = await m.findOne(entidad, { where: { nombre: nombre.trim() } as never });
    if (!valor) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: `Valor no válido para ${campo}: "${nombre}"` });
    return valor;
  }

  /** Resumen de un reporte que se sabe que existe. */
  private async resumen(id: number): Promise<ReporteResumenDto> {
    const reporte = await this.ds.getRepository(Reporte).findOneByOrFail({ id });
    return (await this.aplanar([reporte]))[0];
  }

  /** Bitácora del caso de un reporte, del más antiguo al más reciente. */
  private async bitacora(idReporte: number): Promise<EventoSeguimientoDto[]> {
    const filas: { estatus: string; comentario: string | null; autor: string | null; fecha: Date }[] = await this.ds.query(
      `SELECT e.nombre AS estatus, s.comentario, u.correo AS autor, s.fecha
       FROM reporte_caso rc
       JOIN seguimiento s ON s.id_caso = rc.id_caso
       JOIN estatus_reporte e ON e.id_estatus = s.id_estatus
       LEFT JOIN usuario u ON u.id_usuario = s.id_usuario
       WHERE rc.id_reporte = $1
       ORDER BY s.fecha, s.id_seguimiento`, [idReporte]);
    return filas.map((f) => ({ ...f, fecha: new Date(f.fecha).toISOString() }));
  }

  /** Junta folio y estatus vigente en el resumen que usa la bandeja. */
  private async aplanar(reportes: Reporte[]): Promise<ReporteResumenDto[]> {
    if (reportes.length === 0) return [];
    const ids = reportes.map((r) => r.id);

    const [folios, relaciones] = await Promise.all([
      this.ds.getRepository(Folio).find({ where: { reporte: { id: In(ids) } }, relations: { reporte: true } }),
      this.ds.getRepository(ReporteCaso).find({ where: { idReporte: In(ids) } }),
    ]);
    const folioPor = new Map(folios.map((f) => [f.reporte.id, f.codigo]));
    const casoPor = new Map(relaciones.map((rc) => [rc.idReporte, rc.caso]));

    return reportes.map((r) => ({
      id: r.id,
      folio: folioPor.get(r.id) ?? '',
      estatus: casoPor.get(r.id)?.estatus.nombre ?? ESTATUS_INICIAL,
      ubicacion: r.ubicacion.descripcion,
      actividad: r.actividad.nombre,
      edadAproximada: r.rangoEdad.nombre,
      cantidadNinos: r.cantidadNinos,
      situacionRiesgo: r.riesgo.nombre,
      fechaCreacion: r.fechaCreacion.toISOString(),
      fechaActualizacion: r.fechaActualizacion.toISOString(),
    }));
  }
}
