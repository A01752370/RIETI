import {
  BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Actividad, EstatusReporte, Municipio, RangoEdad, Riesgo } from '../catalogos/catalogo.entities';
import { Usuario } from '../auth/usuario.entity';
import { Caso, Folio, GrupoMenores, Reporte, ReporteCaso, Seguimiento, Ubicacion } from './reporte.entities';
import {
  componerUbicacion, esCodigoPostalEdomex, normalizarGrupos, ORDEN_RANGOS, rangoPrincipal, redondearCoordenada, totalMenores,
} from './formulario';
import {
  AgregarSeguimientoDto, CambiarEstatusDto, ConsultaPublicaDto, CrearReporteDto, EventoPublicoDto,
  EventoSeguimientoDto, FiltrosBandejaDto, ListarReportesDto, PaginaDto, ReporteCreadoDto, ReporteDetalleDto, ReporteResumenDto,
  TipoEventoSeguimiento, ActualizarExpedienteDto, ExpedienteDto, ReporteRelacionadoDto,
} from './reporte.dto';
import { generarClave, hashearClave, verificarClave } from './clave-consulta';
import { ESTATUS, ESTATUS_CERRADOS, ESTATUS_INICIAL, ESTATUS_PENDIENTES, etiquetaEstatus, transicionesPermitidas, validarTransicion } from './estatus';
import { Alcance, exigirAlcance, parametroAlcance, registrarAcceso } from '../auth/alcance';
import { configuracion } from '../config/configuracion';
import { calcularPrioridad, categoriaCantidad, formatearFolio } from './clasificacion';
import { LimitadorIntentos } from './limitador-intentos';
import { celdaCsv } from '../estadisticas/agregados';

/** Filas máximas de una exportación CSV. */
export const MAX_EXPORTACION = 5000;

/** Hash Argon2id de una clave que nadie conoce: se verifica cuando el folio no existe para igualar tiempos. */
const HASH_SENUELO = '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export { formatearFolio } from './clasificacion';

/**
 * Reduce la bitácora a la línea de tiempo pública: solo cambios de estatus
 * (las notas sin cambio de estatus y los comentarios internos no se exponen).
 */
export function lineaDeTiempoPublica(eventos: { estatus: string; fecha: Date }[]): EventoPublicoDto[] {
  const resultado: EventoPublicoDto[] = [];
  for (const e of eventos) {
    if (resultado.at(-1)?.estatus !== e.estatus) {
      resultado.push({ estatus: e.estatus, etiqueta: etiquetaEstatus(e.estatus), fecha: e.fecha.toISOString() });
    }
  }
  return resultado;
}

/**
 * Clasifica los eventos de la bitácora (ordenados del más antiguo al más reciente):
 * el primero es el `registro`, un evento con estatus distinto al anterior es un
 * `cambio` y uno con el mismo estatus es una `nota` interna.
 */
export function clasificarBitacora<T extends { estatus: string; tipo?: string | null }>(eventos: T[]): (T & { tipo: TipoEventoSeguimiento })[] {
  return eventos.map((e, i) => ({
    ...e,
    // Fase 7: las acciones y los cambios de expediente vienen marcados; el resto se clasifica por estatus.
    tipo: e.tipo === 'accion' || e.tipo === 'expediente' ? e.tipo
      : i === 0 ? 'registro' : e.estatus !== eventos[i - 1].estatus ? 'cambio' : 'nota',
  }));
}

/** Fecha en que el caso entró a su estatus vigente: la del último registro o cambio (las notas no cuentan). */
export function fechaEstatusActual(eventos: { tipo: TipoEventoSeguimiento; fecha: string }[], respaldo: string): string {
  return [...eventos].reverse().find((e) => e.tipo === 'registro' || e.tipo === 'cambio')?.fecha ?? respaldo;
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
   * @param idCuenta cuenta de ciudadano a la que se vincula (solo si la persona lo pidió), o null
   * @returns folio y clave de consulta (la clave en claro solo existe en esta respuesta)
   */
  async crear(dto: CrearReporteDto, idCuenta: number | null = null): Promise<ReporteCreadoDto> {
    const claveConsulta = generarClave();
    const claveConsultaHash = await hashearClave(claveConsulta);

    // Formato nuevo (grupos + dirección) o anterior (APK instaladas); ver CrearReporteDto.
    const grupos = normalizarGrupos(dto);
    const cantidadCategoria = categoriaCantidad(dto.cantidad, totalMenores(grupos));
    const prioridad = calcularPrioridad(dto.peligroInmediato, dto.situacionRiesgo);
    const formatoNuevo = dto.grupos !== undefined;
    if (formatoNuevo && dto.actividad.trim() === 'Otro' && !dto.actividadOtro) {
      throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: 'Describe la actividad que observaste' });
    }
    const latitud = redondearCoordenada(dto.latitud);
    const longitud = redondearCoordenada(dto.longitud);
    const descripcionUbicacion = dto.ubicacion ?? componerUbicacion(dto.direccion!);

    const { codigo, fecha } = await this.ds.transaction(async (m) => {
      const [actividad, riesgo, estatus, ...rangos] = await Promise.all([
        this.catalogo(m, Actividad, dto.actividad, 'actividad'),
        this.catalogo(m, Riesgo, dto.situacionRiesgo, 'situacionRiesgo'),
        this.catalogo(m, EstatusReporte, ESTATUS_INICIAL, 'estatus'),
        ...grupos.map((g) => this.catalogo(m, RangoEdad, g.rango, 'grupos.rango')),
      ]) as [Actividad, Riesgo, EstatusReporte, ...RangoEdad[]];
      const rangoPorNombre = new Map(rangos.map((r) => [r.nombre, r]));
      const municipio = await this.municipioValido(m, dto.municipioId);
      if (latitud !== null && longitud !== null) await this.validarPuntoEnMunicipio(m, municipio, latitud, longitud);
      if (dto.direccion) await this.validarCodigoPostal(m, municipio, dto.direccion.codigoPostal);

      const reporte = await m.save(m.create(Reporte, {
        ubicacion: m.create(Ubicacion, {
          descripcion: descripcionUbicacion,
          latitud,
          longitud,
          calle: dto.direccion?.calle ?? null,
          numeroExterior: dto.direccion?.numeroExterior || null,
          colonia: dto.direccion?.colonia ?? null,
          codigoPostal: dto.direccion?.codigoPostal ?? null,
          referencias: dto.direccion?.referencias || null,
        }),
        actividad, riesgo, municipio,
        // Columnas heredadas: el rango con más menores y el total (las leen la bandeja y las APK anteriores).
        rangoEdad: rangoPorNombre.get(rangoPrincipal(grupos))!,
        cantidadNinos: totalMenores(grupos),
        actividadOtro: actividad.nombre === 'Otro' ? dto.actividadOtro || null : null,
        descripcion: dto.descripcion,
        claveConsultaHash,
        avisoPrivacidadVersion: dto.avisoPrivacidadVersion,
        cuentaCiudadanoId: idCuenta,
        peligroInmediato: dto.peligroInmediato ?? null,
        prioridad,
        cantidadCategoria,
        canal: dto.canal ?? null,
        origen: 'ciudadano',
      }));
      await m.save(grupos.map((g) => m.create(GrupoMenores, {
        idReporte: reporte.id, idRangoEdad: rangoPorNombre.get(g.rango)!.id, cantidad: g.cantidad,
      })));

      // Consecutivo anual atómico (sin carreras entre peticiones concurrentes).
      const anio = new Date().getFullYear();
      const [{ ultimo }] = await m.query(
        `INSERT INTO folio_contador (anio, ultimo) VALUES ($1, 1)
         ON CONFLICT (anio) DO UPDATE SET ultimo = folio_contador.ultimo + 1
         RETURNING ultimo`, [anio]);
      // Clave municipal solo para clientes que declaran su canal (los anteriores solo saben consultar el formato heredado).
      const folio = formatearFolio(anio, ultimo, dto.canal ? municipio.claveFolio : null);
      await m.save(m.create(Folio, { reporte, anio, consecutivo: ultimo, codigo: folio }));

      // Fase 7: alerta de punto recurrente (varios reportes cerca en poco tiempo).
      if (latitud !== null && longitud !== null) await this.evaluarAlerta(m, municipio.id, latitud, longitud);

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
      estatusEtiqueta: etiquetaEstatus(reporte.estatus),
      fechaCreacion: reporte.fechaCreacion,
      fechaActualizacion: reporte.fechaActualizacion,
      historial: lineaDeTiempoPublica(eventos.map((e) => ({ estatus: e.estatus, fecha: new Date(e.fecha) }))),
    };
  }

  /**
   * FROM/WHERE parametrizado de la bandeja y la exportación ($1…$15; $12 es el alcance territorial). El orden de
   * los parámetros lo fija {@link parametrosBandeja}.
   */
  private static readonly DESDE_BANDEJA = `
      FROM reporte r
      JOIN reporte_caso rc ON rc.id_reporte = r.id_reporte
      JOIN caso c ON c.id_caso = rc.id_caso
      JOIN estatus_reporte e ON e.id_estatus = c.id_estatus
      JOIN actividad a ON a.id_actividad = r.id_actividad
      JOIN folio f ON f.id_reporte = r.id_reporte
      WHERE ($1::text IS NULL OR e.nombre = $1::text)
        AND ($2::int IS NULL OR r.id_municipio = $2::int)
        AND ($3::text IS NULL OR a.nombre = $3::text)
        AND ($4::date IS NULL OR (r.fecha_creacion AT TIME ZONE 'America/Mexico_City')::date >= $4::date)
        AND ($5::date IS NULL OR (r.fecha_creacion AT TIME ZONE 'America/Mexico_City')::date <= $5::date)
        AND ($6::text IS NULL OR f.codigo LIKE '%' || $6::text || '%')
        AND ($7::int IS NULL OR (e.nombre = ANY($11::text[])
             AND c.fecha_actualizacion < now() - make_interval(days => $7::int)))
        AND ($8::text IS NULL OR EXISTS (SELECT 1 FROM riesgo ri0 WHERE ri0.id_riesgo = r.id_riesgo AND ri0.nombre = $8::text))
        AND ($9::boolean IS NOT TRUE OR e.nombre = ANY($11::text[]))
        AND ($10::text IS NULL OR r.prioridad = $10::text)
        AND ($12::int[] IS NULL OR r.id_municipio = ANY($12::int[]))
        AND ($13::boolean IS NOT TRUE OR (c.fecha_seguimiento < (now() AT TIME ZONE 'America/Mexico_City')::date
             AND e.nombre <> ALL($14::text[])))
        AND ($15::text IS NULL OR c.verificacion = $15::text)`;

  private parametrosBandeja(f: FiltrosBandejaDto, alcance: Alcance): unknown[] {
    // El folio ya viene validado (solo letras, dígitos y guiones), así que LIKE no recibe comodines.
    return [f.estatus ?? null, f.municipioId ?? null, f.actividad ?? null, f.desde ?? null, f.hasta ?? null,
      f.folio ?? null, f.sinAtenderDias ?? null, f.riesgo ?? null, f.pendientes ?? null, f.prioridad ?? null, [...ESTATUS_PENDIENTES],
      parametroAlcance(alcance), f.vencidos ?? null, [...ESTATUS_CERRADOS], f.verificacion ?? null];
  }

  /** CU-09: bandeja del personal con filtros, búsqueda por folio, orden y paginación. */
  async listar(f: ListarReportesDto, alcance: Alcance): Promise<PaginaDto<ReporteResumenDto>> {
    const { pagina, tamano } = f;
    const desde = ReportesService.DESDE_BANDEJA;
    const params = this.parametrosBandeja(f, alcance);
    const direccion = f.orden === 'antiguos' ? 'ASC' : 'DESC';
    // Con orden por prioridad: Alta, Media, Normal y, dentro de cada una, lo más reciente primero.
    const primero = f.orden === 'prioridad' ? 'rango_prioridad, ' : '';
    const [{ total }] = await this.ds.query(`SELECT count(DISTINCT r.id_reporte)::int AS total ${desde}`, params);
    const filas: { id: number }[] = await this.ds.query(
      `SELECT DISTINCT r.id_reporte AS id, r.fecha_creacion,
              CASE r.prioridad WHEN 'Alta' THEN 0 WHEN 'Media' THEN 1 ELSE 2 END AS rango_prioridad ${desde}
       ORDER BY ${primero}r.fecha_creacion ${direccion}, r.id_reporte ${direccion}
       LIMIT $16 OFFSET $17`, [...params, tamano, (pagina - 1) * tamano]);

    const ids = filas.map((f) => Number(f.id));
    const reportes = ids.length === 0 ? [] : await this.ds.getRepository(Reporte).findBy({ id: In(ids) });
    const porId = new Map((await this.aplanar(reportes)).map((r) => [r.id, r]));
    return { elementos: ids.map((id) => porId.get(id)!).filter(Boolean), total, pagina, tamano };
  }

  /**
   * Exportación CSV de la bandeja con los mismos filtros (máximo {@link MAX_EXPORTACION} filas).
   *
   * Minimización: solo columnas de la bandeja (sin descripción libre, sin
   * coordenadas ni dirección exacta: solo la colonia). Celdas protegidas contra
   * inyección de fórmulas.
   */
  async exportarCsv(f: FiltrosBandejaDto, alcance: Alcance): Promise<string> {
    const direccion = f.orden === 'antiguos' ? 'ASC' : 'DESC';
    const filas: Record<string, string | number | null>[] = await this.ds.query(
      `SELECT f.codigo AS folio,
              to_char(r.fecha_creacion AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') AS fecha,
              e.nombre AS estatus, m.nombre AS municipio, u.colonia, a.nombre AS actividad, r.cantidad_ninos AS menores,
              (SELECT string_agg(re.nombre || ': ' || g.cantidad, '; ' ORDER BY re.id_rango_edad)
                 FROM reporte_menores_grupo g JOIN rango_edad re ON re.id_rango_edad = g.id_rango_edad
                WHERE g.id_reporte = r.id_reporte) AS grupos,
              ri.nombre AS riesgo,
              to_char(r.fecha_actualizacion AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') AS actualizado
       ${ReportesService.DESDE_BANDEJA.replace('WHERE', `JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion
         JOIN riesgo ri ON ri.id_riesgo = r.id_riesgo
         LEFT JOIN municipio m ON m.id_municipio = r.id_municipio WHERE`)}
       ORDER BY r.fecha_creacion ${direccion}, r.id_reporte ${direccion}
       LIMIT $16`, [...this.parametrosBandeja(f, alcance), MAX_EXPORTACION]);
    // Bitácora de accesos (Fase 7): una entrada por exportación, con los filtros (sin datos personales).
    const filtros = Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${v}`).join('&');
    await registrarAcceso(this.ds, alcance.idUsuario, 'exportar', null, `${filas.length} fila(s); ${filtros}`);
    const columnas = ['folio', 'fecha', 'estatus', 'municipio', 'colonia', 'actividad', 'menores', 'grupos', 'riesgo', 'actualizado'];
    const encabezado = ['Folio', 'Fecha', 'Estatus', 'Municipio', 'Colonia', 'Actividad', 'Menores', 'Grupos de edad', 'Riesgo percibido', 'Última actualización'];
    const lineas = [encabezado.map(celdaCsv).join(','), ...filas.map((x) => columnas.map((c) => celdaCsv(x[c])).join(','))];
    // BOM para que Excel abra los acentos correctamente.
    return `\uFEFF${lineas.join('\r\n')}\r\n`;
  }

  /**
   * CU-09: detalle completo con bitácora, transiciones permitidas y expediente (Fase 7).
   *
   * @param alcance alcance territorial de quien consulta; un reporte de otro municipio da el mismo 404
   * @param registrar true para dejar constancia en la bitácora de accesos (consulta directa del personal)
   */
  async detalle(id: number, alcance: Alcance, registrar = false): Promise<ReporteDetalleDto> {
    const reporte = await this.ds.getRepository(Reporte).findOneBy({ id });
    if (!reporte) throw new NotFoundException('Reporte no encontrado');
    exigirAlcance(alcance, reporte.municipio?.id);
    const [resumen] = await this.aplanar([reporte]);
    const rc = await this.ds.getRepository(ReporteCaso).findOneBy({ idReporte: id });
    const grupos = await this.ds.getRepository(GrupoMenores).find({ where: { idReporte: id } });
    const u = reporte.ubicacion;
    const historial = await this.bitacora(id);
    if (registrar) await registrarAcceso(this.ds, alcance.idUsuario, 'ver', { id, folio: resumen.folio });
    const posicion = (r: string) => ORDEN_RANGOS.indexOf(r);
    return {
      ...resumen,
      latitud: u.latitud,
      longitud: u.longitud,
      descripcion: reporte.descripcion,
      grupos: grupos
        .map((g) => ({ rango: g.rangoEdad.nombre, cantidad: g.cantidad }))
        .sort((a, b) => posicion(a.rango) - posicion(b.rango)),
      actividadOtro: reporte.actividadOtro,
      direccion: u.calle || u.colonia || u.codigoPostal
        ? { calle: u.calle, numeroExterior: u.numeroExterior, colonia: u.colonia, codigoPostal: u.codigoPostal, referencias: u.referencias }
        : null,
      motivoDescarte: rc?.caso.motivoDescarte ?? null,
      historial,
      transicionesPermitidas: transicionesPermitidas(resumen.estatus),
      fechaEstatusActual: fechaEstatusActual(historial, resumen.fechaCreacion),
      cantidadCategoria: reporte.cantidadCategoria,
      canal: reporte.canal,
      origen: reporte.origen,
      expediente: await this.expediente(rc!.caso, resumen.estatus),
      duplicadoDe: reporte.duplicadoDe ? (await this.relacionados([reporte.duplicadoDe]))[0] ?? null : null,
      duplicados: await this.relacionados(
        (await this.ds.query('SELECT id_reporte FROM reporte WHERE duplicado_de = $1 ORDER BY id_reporte', [id])).map((x: { id_reporte: number }) => Number(x.id_reporte))),
    };
  }

  /**
   * CU-09/CU-10: cambia el estatus validando la máquina de estados y deja
   * constancia en la bitácora (append-only).
   *
   * @throws UnprocessableEntityException transición inválida o falta motivo/comentario
   */
  async cambiarEstatus(id: number, dto: CambiarEstatusDto, alcance: Alcance): Promise<ReporteDetalleDto> {
    const idUsuario = alcance.idUsuario;
    await this.ds.transaction(async (m) => {
      const rc = await m.findOne(ReporteCaso, { where: { idReporte: id } });
      if (!rc) throw new NotFoundException('Reporte no encontrado');
      await this.exigirAlcanceReporte(m, alcance, id);
      // Bloquea la fila del caso para que dos personas no cambien el estatus a la vez.
      await m.query('SELECT 1 FROM caso WHERE id_caso = $1 FOR UPDATE', [rc.idCaso]);
      const caso = await m.findOneByOrFail(Caso, { id: rc.idCaso });

      const error = validarTransicion(caso.estatus.nombre, dto.estatus, dto.comentario, dto.motivo);
      if (error) throw new UnprocessableEntityException(error);

      // Fase 7: resultado y cierre obligatorios al concluir o cancelar.
      const resultado = dto.estatus === ESTATUS.DESCARTADO ? dto.motivo : (dto.resultado || dto.comentario);
      if (dto.estatus === ESTATUS.CONCLUIDO && !resultado?.trim()) {
        throw new UnprocessableEntityException({ codigo: 'RESULTADO_REQUERIDO', mensaje: 'Para concluir un caso escribe el resultado' });
      }

      const estatus = await this.catalogo(m, EstatusReporte, dto.estatus, 'estatus');
      caso.estatus = estatus;
      if (dto.estatus === ESTATUS.DESCARTADO) caso.motivoDescarte = dto.motivo!;
      if (dto.estatus === ESTATUS.CONCLUIDO || dto.estatus === ESTATUS.DESCARTADO) {
        caso.resultado = resultado!.trim().slice(0, 1000);
        caso.fechaCierre = new Date();
      } else if (dto.estatus === ESTATUS.ARCHIVADO) {
        caso.fechaCierre = caso.fechaCierre ?? new Date();
      } else {
        caso.fechaCierre = null; // Reincidente o vuelta a atención: el caso se reabre
      }
      await m.save(caso);

      const nota = [
        dto.comentario,
        dto.estatus === ESTATUS.DESCARTADO ? `Motivo de cancelación: ${dto.motivo}` : null,
        dto.estatus === ESTATUS.CONCLUIDO && dto.resultado && dto.resultado !== dto.comentario ? `Resultado: ${dto.resultado}` : null,
      ].filter((t) => t?.trim()).join('\n') || null;
      await m.save(m.create(Seguimiento, { caso, estatus, comentario: nota, usuario: { id: idUsuario } as Usuario }));
      await m.update(Reporte, { id }, { fechaActualizacion: () => 'now()' });
    });
    return this.detalle(id, alcance);
  }

  /** Agrega una nota interna o una acción realizada (Fase 7) sin cambiar el estatus. */
  async agregarSeguimiento(id: number, dto: AgregarSeguimientoDto, alcance: Alcance): Promise<ReporteDetalleDto> {
    await this.ds.transaction(async (m) => {
      const rc = await m.findOne(ReporteCaso, { where: { idReporte: id } });
      if (!rc) throw new NotFoundException('Reporte no encontrado');
      await this.exigirAlcanceReporte(m, alcance, id);
      await m.save(m.create(Seguimiento, {
        caso: rc.caso, estatus: rc.caso.estatus, comentario: dto.comentario, usuario: { id: alcance.idUsuario } as Usuario,
        tipo: dto.tipo === 'accion' ? 'accion' : null,
      }));
      await m.update(Reporte, { id }, { fechaActualizacion: () => 'now()' });
    });
    return this.detalle(id, alcance);
  }

  // ---------- Expediente, duplicados y alertas (Fase 7) ----------

  /**
   * Actualiza los campos del expediente y deja en la bitácora qué cambió, quién y cuándo.
   *
   * @throws BadRequestException responsable, dependencia o modalidad inexistentes
   */
  async actualizarExpediente(id: number, dto: ActualizarExpedienteDto, alcance: Alcance): Promise<ReporteDetalleDto> {
    await this.ds.transaction(async (m) => {
      const rc = await m.findOne(ReporteCaso, { where: { idReporte: id } });
      if (!rc) throw new NotFoundException('Reporte no encontrado');
      const idMunicipio = await this.exigirAlcanceReporte(m, alcance, id);
      await m.query('SELECT 1 FROM caso WHERE id_caso = $1 FOR UPDATE', [rc.idCaso]);
      const caso = await m.findOneByOrFail(Caso, { id: rc.idCaso });
      const antes = await this.expediente(caso, caso.estatus.nombre, m);
      const cambios: string[] = [];

      if (dto.idResponsable !== undefined) {
        if (dto.idResponsable !== null) await this.validarResponsable(m, dto.idResponsable, idMunicipio);
        caso.idResponsable = dto.idResponsable;
      }
      if (dto.idDependencia !== undefined) {
        if (dto.idDependencia !== null) await this.existe(m, 'dependencia', 'id_dependencia', dto.idDependencia, 'dependencia');
        caso.idDependencia = dto.idDependencia;
      }
      if (dto.idModalidad !== undefined) {
        if (dto.idModalidad !== null) await this.existe(m, 'modalidad', 'id_modalidad', dto.idModalidad, 'modalidad');
        caso.idModalidad = dto.idModalidad;
      }
      if (dto.fechaSeguimiento !== undefined) caso.fechaSeguimiento = dto.fechaSeguimiento;
      if (dto.verificacion !== undefined) caso.verificacion = dto.verificacion;
      if (dto.nnaIdentificados !== undefined) caso.nnaIdentificados = dto.nnaIdentificados;
      if (dto.nnaCanalizados !== undefined) caso.nnaCanalizados = dto.nnaCanalizados;
      if (dto.nnaNinas !== undefined) caso.nnaNinas = dto.nnaNinas;
      if (dto.nnaNinos !== undefined) caso.nnaNinos = dto.nnaNinos;
      await m.save(caso);

      const despues = await this.expediente(caso, caso.estatus.nombre, m);
      const texto = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? String((v as { nombre?: string; correo?: string }).nombre ?? (v as { correo?: string }).correo) : String(v));
      const etiquetas: [keyof typeof antes, string][] = [
        ['responsable', 'Responsable'], ['dependencia', 'Dependencia'], ['fechaSeguimiento', 'Fecha de seguimiento'],
        ['modalidad', 'Modalidad'], ['verificacion', 'Verificación'], ['nnaIdentificados', 'NNA identificados'],
        ['nnaCanalizados', 'NNA canalizados'], ['nnaNinas', 'Niñas'], ['nnaNinos', 'Niños'],
      ];
      for (const [campo, nombre] of etiquetas) {
        if (texto(antes[campo]) !== texto(despues[campo])) cambios.push(`${nombre}: ${texto(antes[campo])} → ${texto(despues[campo])}`);
      }
      if (cambios.length > 0) {
        await m.save(m.create(Seguimiento, {
          caso, estatus: caso.estatus, comentario: cambios.join('\n'), usuario: { id: alcance.idUsuario } as Usuario, tipo: 'expediente',
        }));
        await m.update(Reporte, { id }, { fechaActualizacion: () => 'now()' });
      }
    });
    return this.detalle(id, alcance);
  }

  /**
   * Posibles duplicados: reportes del mismo municipio a menos del radio configurado y dentro
   * de la ventana de días, que no estén ya vinculados. Solo sugerencias: no se fusiona nada.
   */
  async cercanos(id: number, alcance: Alcance): Promise<ReporteRelacionadoDto[]> {
    const reporte = await this.ds.getRepository(Reporte).findOneBy({ id });
    if (!reporte) throw new NotFoundException('Reporte no encontrado');
    exigirAlcance(alcance, reporte.municipio?.id);
    const u = reporte.ubicacion;
    if (u.latitud === null || u.longitud === null || !reporte.municipio) return [];
    const radio = await configuracion(this.ds, 'duplicados_radio_m', 150);
    const dias = await configuracion(this.ds, 'duplicados_dias', 30);
    const filas: { id: number; distancia: number }[] = await this.ds.query(
      `SELECT r.id_reporte AS id,
              round(ST_Distance(ST_SetSRID(ST_MakePoint(u.longitud, u.latitud), 4326)::geography,
                                ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography))::int AS distancia
       FROM reporte r JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion
       WHERE r.id_reporte <> $1 AND r.id_municipio = $4 AND r.duplicado_de IS NULL
         AND u.latitud IS NOT NULL AND u.longitud IS NOT NULL
         AND abs(extract(epoch FROM (r.fecha_creacion - $6::timestamptz))) <= $7 * 86400
         AND ST_DWithin(ST_SetSRID(ST_MakePoint(u.longitud, u.latitud), 4326)::geography,
                        ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $5)
         AND NOT EXISTS (SELECT 1 FROM reporte d WHERE d.id_reporte = $1 AND d.duplicado_de = r.id_reporte)
       ORDER BY distancia, r.fecha_creacion DESC
       LIMIT 20`,
      [id, u.latitud, u.longitud, reporte.municipio.id, radio, reporte.fechaCreacion, dias]);
    const datos = await this.relacionados(filas.map((f) => Number(f.id)));
    const distancia = new Map(filas.map((f) => [Number(f.id), Number(f.distancia)]));
    return datos.map((d) => ({ ...d, distanciaMetros: distancia.get(d.id) }));
  }

  /**
   * Marca el reporte como posible duplicado de un principal (mismo municipio). El principal
   * acumula el conteo; no se borra ni se fusiona nada y se puede deshacer.
   *
   * @throws UnprocessableEntityException `DUPLICADO_INVALIDO`
   */
  async vincularDuplicado(id: number, idPrincipal: number, alcance: Alcance): Promise<ReporteDetalleDto> {
    await this.ds.transaction(async (m) => {
      const [r, p] = await Promise.all([m.findOneBy(Reporte, { id }), m.findOneBy(Reporte, { id: idPrincipal })]);
      if (!r || !p) throw new NotFoundException('Reporte no encontrado');
      exigirAlcance(alcance, r.municipio?.id);
      exigirAlcance(alcance, p.municipio?.id);
      const invalido = (mensaje: string) => new UnprocessableEntityException({ codigo: 'DUPLICADO_INVALIDO', mensaje });
      if (id === idPrincipal) throw invalido('Un reporte no puede ser duplicado de sí mismo');
      if (r.municipio?.id !== p.municipio?.id) throw invalido('Solo se vinculan reportes del mismo municipio');
      if (p.duplicadoDe) throw invalido('El reporte principal ya es un duplicado; vincúlalo a su principal');
      const [{ n }] = await m.query('SELECT count(*)::int AS n FROM reporte WHERE duplicado_de = $1', [id]);
      if (n > 0) throw invalido('Este reporte ya es principal de otros; no puede ser duplicado');
      await m.update(Reporte, { id }, { duplicadoDe: idPrincipal });
      const folio = await this.folioDe(m, idPrincipal);
      await this.anotarExpediente(m, id, alcance.idUsuario, `Marcado como posible duplicado de ${folio}`);
      await this.anotarExpediente(m, idPrincipal, alcance.idUsuario, `Se vinculó un posible duplicado: ${await this.folioDe(m, id)}`);
    });
    return this.detalle(id, alcance);
  }

  /** Deshace el vínculo de posible duplicado. */
  async desvincularDuplicado(id: number, alcance: Alcance): Promise<ReporteDetalleDto> {
    await this.ds.transaction(async (m) => {
      const r = await m.findOneBy(Reporte, { id });
      if (!r) throw new NotFoundException('Reporte no encontrado');
      exigirAlcance(alcance, r.municipio?.id);
      if (!r.duplicadoDe) return;
      const principal = await this.folioDe(m, r.duplicadoDe);
      await m.update(Reporte, { id }, { duplicadoDe: null });
      await this.anotarExpediente(m, id, alcance.idUsuario, `Se quitó el vínculo de duplicado con ${principal}`);
    });
    return this.detalle(id, alcance);
  }

  /** Personal que puede ser responsable del reporte: activo y con acceso a su municipio. */
  async responsables(id: number, alcance: Alcance): Promise<{ id: number; correo: string; perfil: string }[]> {
    const reporte = await this.ds.getRepository(Reporte).findOneBy({ id });
    if (!reporte) throw new NotFoundException('Reporte no encontrado');
    exigirAlcance(alcance, reporte.municipio?.id);
    const filas: { id: number; correo: string; perfil: string }[] = await this.ds.query(
      `SELECT u.id_usuario AS id, u.correo, r.nombre AS perfil
       FROM usuario u JOIN rol_usuario r ON r.id_rol = u.id_rol
       WHERE u.activo AND r.es_personal
         AND (r.nombre IN ('Administrador', 'Coordinador regional')
              OR EXISTS (SELECT 1 FROM asignacion_municipio a WHERE a.id_usuario = u.id_usuario AND a.id_municipio = $1))
       ORDER BY u.correo`, [reporte.municipio?.id ?? null]);
    return filas.map((f) => ({ ...f, id: Number(f.id) }));
  }

  /**
   * Alerta de punto recurrente: si en el radio y la ventana configurados hay al menos el mínimo
   * de reportes del mismo municipio, abre una alerta (o actualiza la abierta más cercana).
   */
  private async evaluarAlerta(m: EntityManager, idMunicipio: number, lat: number, lng: number): Promise<void> {
    const radio = await configuracion(m, 'alerta_radio_m', 150);
    const dias = await configuracion(m, 'alerta_dias', 30);
    const minimo = await configuracion(m, 'alerta_minimo', 3);
    const punto = 'ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography';
    const [{ n }] = await m.query(
      `SELECT count(*)::int AS n FROM reporte r JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion
       WHERE r.id_municipio = $1 AND u.latitud IS NOT NULL AND r.fecha_creacion >= now() - make_interval(days => $5::int)
         AND ST_DWithin(ST_SetSRID(ST_MakePoint(u.longitud, u.latitud), 4326)::geography, ${punto}, $4)`,
      [idMunicipio, lat, lng, radio, dias]);
    if (n < minimo) return;
    const [abierta] = await m.query(
      `SELECT id_alerta FROM alerta_territorial
       WHERE id_municipio = $1 AND estatus = 'abierta'
         AND ST_DWithin(ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)::geography, ${punto}, $4)
       ORDER BY fecha_creacion DESC LIMIT 1`, [idMunicipio, lat, lng, radio]);
    if (abierta) {
      await m.query('UPDATE alerta_territorial SET reportes = GREATEST(reportes, $2), fecha_actualizacion = now() WHERE id_alerta = $1', [abierta.id_alerta, n]);
    } else {
      await m.query('INSERT INTO alerta_territorial (id_municipio, latitud, longitud, reportes) VALUES ($1, $2, $3, $4)', [idMunicipio, lat, lng, n]);
    }
  }

  /** Expediente del caso con nombres legibles. */
  private async expediente(caso: Caso, estatus: string, m: EntityManager | DataSource = this.ds): Promise<ExpedienteDto> {
    const uno = async (sql: string, idValor: number | null) =>
      idValor === null ? null : ((await m.query(sql, [idValor]))[0] ?? null);
    const responsable = await uno('SELECT id_usuario AS id, correo FROM usuario WHERE id_usuario = $1', caso.idResponsable);
    const dependencia = await uno('SELECT id_dependencia AS id, nombre FROM dependencia WHERE id_dependencia = $1', caso.idDependencia);
    const modalidad = await uno('SELECT id_modalidad AS id, nombre FROM modalidad WHERE id_modalidad = $1', caso.idModalidad);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    return {
      responsable: responsable && { id: Number(responsable.id), correo: responsable.correo },
      dependencia: dependencia && { id: Number(dependencia.id), nombre: dependencia.nombre },
      fechaSeguimiento: caso.fechaSeguimiento,
      seguimientoVencido: Boolean(caso.fechaSeguimiento && caso.fechaSeguimiento < hoy && !(ESTATUS_CERRADOS as readonly string[]).includes(estatus)),
      resultado: caso.resultado,
      fechaCierre: caso.fechaCierre ? new Date(caso.fechaCierre).toISOString() : null,
      modalidad: modalidad && { id: Number(modalidad.id), nombre: modalidad.nombre },
      verificacion: caso.verificacion,
      nnaIdentificados: caso.nnaIdentificados,
      nnaCanalizados: caso.nnaCanalizados,
      nnaNinas: caso.nnaNinas,
      nnaNinos: caso.nnaNinos,
    };
  }

  /** Resumen corto de reportes relacionados (duplicados o cercanos). */
  private async relacionados(ids: number[]): Promise<ReporteRelacionadoDto[]> {
    if (ids.length === 0) return [];
    const filas: { id: number; folio: string; estatus: string; fecha: Date }[] = await this.ds.query(
      `SELECT r.id_reporte AS id, f.codigo AS folio, e.nombre AS estatus, r.fecha_creacion AS fecha
       FROM reporte r JOIN folio f ON f.id_reporte = r.id_reporte
       JOIN reporte_caso rc ON rc.id_reporte = r.id_reporte JOIN caso c ON c.id_caso = rc.id_caso
       JOIN estatus_reporte e ON e.id_estatus = c.id_estatus
       WHERE r.id_reporte = ANY($1::int[])`, [ids]);
    const porId = new Map(filas.map((f) => [Number(f.id), f]));
    return ids.filter((i) => porId.has(i)).map((i) => {
      const f = porId.get(i)!;
      return { id: i, folio: f.folio, estatus: f.estatus, estatusEtiqueta: etiquetaEstatus(f.estatus), fechaCreacion: new Date(f.fecha).toISOString() };
    });
  }

  /** Verifica el alcance sobre un reporte dentro de una transacción; devuelve su municipio. */
  private async exigirAlcanceReporte(m: EntityManager, alcance: Alcance, id: number): Promise<number | null> {
    const [fila] = await m.query('SELECT id_municipio FROM reporte WHERE id_reporte = $1', [id]);
    if (!fila) throw new NotFoundException('Reporte no encontrado');
    exigirAlcance(alcance, fila.id_municipio);
    return fila.id_municipio === null ? null : Number(fila.id_municipio);
  }

  /** El responsable debe ser personal activo con acceso al municipio del reporte. */
  private async validarResponsable(m: EntityManager, idUsuario: number, idMunicipio: number | null): Promise<void> {
    const [fila] = await m.query(
      `SELECT 1 FROM usuario u JOIN rol_usuario r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = $1 AND u.activo AND r.es_personal
         AND (r.nombre IN ('Administrador', 'Coordinador regional')
              OR EXISTS (SELECT 1 FROM asignacion_municipio a WHERE a.id_usuario = u.id_usuario AND a.id_municipio = $2))`,
      [idUsuario, idMunicipio]);
    if (!fila) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: 'La persona responsable no tiene acceso a este municipio' });
  }

  /** 400 si el id no existe en el catálogo. */
  private async existe(m: EntityManager, tabla: 'dependencia' | 'modalidad', columna: string, valor: number, campo: string): Promise<void> {
    const [fila] = await m.query(`SELECT 1 FROM ${tabla} WHERE ${columna} = $1`, [valor]);
    if (!fila) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: `Valor no válido para ${campo}` });
  }

  private async folioDe(m: EntityManager, id: number): Promise<string> {
    return (await m.query('SELECT codigo FROM folio WHERE id_reporte = $1', [id]))[0]?.codigo ?? `#${id}`;
  }

  /** Entrada de bitácora de tipo `expediente` en el caso de un reporte. */
  private async anotarExpediente(m: EntityManager, idReporte: number, idUsuario: number, texto: string): Promise<void> {
    const rc = await m.findOneByOrFail(ReporteCaso, { idReporte });
    await m.save(m.create(Seguimiento, { caso: rc.caso, estatus: rc.caso.estatus, comentario: texto, usuario: { id: idUsuario } as Usuario, tipo: 'expediente' }));
    await m.update(Reporte, { id: idReporte }, { fechaActualizacion: () => 'now()' });
  }

  /** Municipio activo del catálogo; 400 si no existe o está inactivo (D-16). */
  private async municipioValido(m: EntityManager, id: number): Promise<Municipio> {
    const municipio = await m.findOneBy(Municipio, { id, activo: true });
    if (!municipio) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: 'El municipio seleccionado no es válido' });
    return municipio;
  }

  /**
   * Valida que el punto del mapa caiga dentro del municipio elegido (o a menos de
   * 300 m de su límite, por la imprecisión del GPS y de los polígonos simplificados).
   * Si el municipio no tiene polígono cargado, no se valida.
   *
   * @throws BadRequestException `UBICACION_FUERA_DEL_MUNICIPIO`, con el municipio donde sí cae el punto
   */
  private async validarPuntoEnMunicipio(m: EntityManager, municipio: Municipio, lat: number, lng: number): Promise<void> {
    const [r]: { tiene: boolean; dentro: boolean; donde: string | null }[] = await m.query(
      `SELECT
         EXISTS (SELECT 1 FROM municipio_geom WHERE id_municipio = $1) AS tiene,
         EXISTS (SELECT 1 FROM municipio_geom WHERE id_municipio = $1
                 AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, 300)) AS dentro,
         (SELECT mu.nombre FROM municipio_geom g JOIN municipio mu ON mu.id_municipio = g.id_municipio
          WHERE ST_Contains(g.geom, ST_SetSRID(ST_MakePoint($3, $2), 4326)) LIMIT 1) AS donde`,
      [municipio.id, lat, lng]);
    if (!r.tiene || r.dentro) return;
    const lugar = r.donde ? `en ${r.donde}` : 'fuera del Estado de México';
    throw new BadRequestException({
      codigo: 'UBICACION_FUERA_DEL_MUNICIPIO',
      mensaje: `El punto del mapa está ${lugar}, no en ${municipio.nombre}. Corrige el municipio o mueve el marcador.`,
    });
  }

  /**
   * Valida el código postal: siempre que sea del Estado de México (50000–57999) y,
   * si se cargó el catálogo de SEPOMEX en `codigo_postal_municipio`, que corresponda al municipio.
   *
   * @throws BadRequestException `CODIGO_POSTAL_NO_VALIDO`
   */
  private async validarCodigoPostal(m: EntityManager, municipio: Municipio, cp: string): Promise<void> {
    if (!esCodigoPostalEdomex(cp)) {
      throw new BadRequestException({ codigo: 'CODIGO_POSTAL_NO_VALIDO', mensaje: 'El código postal no es del Estado de México (empieza con 50 a 57)' });
    }
    const filas: { clave_inegi: string }[] = await m.query(
      'SELECT clave_inegi FROM codigo_postal_municipio WHERE codigo_postal = $1', [cp]);
    if (filas.length > 0 && municipio.claveInegi && !filas.some((f) => f.clave_inegi === municipio.claveInegi)) {
      throw new BadRequestException({ codigo: 'CODIGO_POSTAL_NO_VALIDO', mensaje: `El código postal ${cp} no corresponde a ${municipio.nombre}` });
    }
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
    const filas: { estatus: string; comentario: string | null; autor: string | null; fecha: Date; tipo: string | null }[] = await this.ds.query(
      `SELECT e.nombre AS estatus, s.comentario, u.correo AS autor, s.fecha, s.tipo
       FROM reporte_caso rc
       JOIN seguimiento s ON s.id_caso = rc.id_caso
       JOIN estatus_reporte e ON e.id_estatus = s.id_estatus
       LEFT JOIN usuario u ON u.id_usuario = s.id_usuario
       WHERE rc.id_reporte = $1
       ORDER BY s.fecha, s.id_seguimiento`, [idReporte]);
    return clasificarBitacora(filas.map((f) => ({ ...f, etiqueta: etiquetaEstatus(f.estatus), fecha: new Date(f.fecha).toISOString() })));
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
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const vencido = (c: Caso | undefined) => Boolean(c?.fechaSeguimiento && c.fechaSeguimiento < hoy
      && !(ESTATUS_CERRADOS as readonly string[]).includes(c.estatus.nombre));

    return reportes.map((r) => ({
      id: r.id,
      folio: folioPor.get(r.id) ?? '',
      estatus: casoPor.get(r.id)?.estatus.nombre ?? ESTATUS_INICIAL,
      estatusEtiqueta: etiquetaEstatus(casoPor.get(r.id)?.estatus.nombre ?? ESTATUS_INICIAL),
      prioridad: r.prioridad,
      peligroInmediato: r.peligroInmediato,
      verificacion: casoPor.get(r.id)?.verificacion ?? 'Sin verificar',
      esDuplicado: r.duplicadoDe !== null && r.duplicadoDe !== undefined,
      seguimientoVencido: vencido(casoPor.get(r.id)),
      ubicacion: r.ubicacion.descripcion,
      municipio: r.municipio?.nombre ?? null,
      actividad: r.actividad.nombre,
      edadAproximada: r.rangoEdad.nombre,
      cantidadNinos: r.cantidadNinos,
      situacionRiesgo: r.riesgo.nombre,
      fechaCreacion: r.fechaCreacion.toISOString(),
      fechaActualizacion: r.fechaActualizacion.toISOString(),
    }));
  }
}
