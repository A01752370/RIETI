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
  TipoEventoSeguimiento,
} from './reporte.dto';
import { generarClave, hashearClave, verificarClave } from './clave-consulta';
import { ESTATUS, ESTATUS_INICIAL, ESTATUS_PENDIENTES, etiquetaEstatus, transicionesPermitidas, validarTransicion } from './estatus';
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
export function clasificarBitacora<T extends { estatus: string }>(eventos: T[]): (T & { tipo: TipoEventoSeguimiento })[] {
  return eventos.map((e, i) => ({
    ...e,
    tipo: i === 0 ? 'registro' : e.estatus !== eventos[i - 1].estatus ? 'cambio' : 'nota',
  }));
}

/** Fecha en que el caso entró a su estatus vigente: la del último registro o cambio (las notas no cuentan). */
export function fechaEstatusActual(eventos: { tipo: TipoEventoSeguimiento; fecha: string }[], respaldo: string): string {
  return [...eventos].reverse().find((e) => e.tipo !== 'nota')?.fecha ?? respaldo;
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
   * FROM/WHERE parametrizado de la bandeja y la exportación ($1…$11). El orden de
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
        AND ($10::text IS NULL OR r.prioridad = $10::text)`;

  private parametrosBandeja(f: FiltrosBandejaDto): unknown[] {
    // El folio ya viene validado (solo letras, dígitos y guiones), así que LIKE no recibe comodines.
    return [f.estatus ?? null, f.municipioId ?? null, f.actividad ?? null, f.desde ?? null, f.hasta ?? null,
      f.folio ?? null, f.sinAtenderDias ?? null, f.riesgo ?? null, f.pendientes ?? null, f.prioridad ?? null, [...ESTATUS_PENDIENTES]];
  }

  /** CU-09: bandeja del personal con filtros, búsqueda por folio, orden y paginación. */
  async listar(f: ListarReportesDto): Promise<PaginaDto<ReporteResumenDto>> {
    const { pagina, tamano } = f;
    const desde = ReportesService.DESDE_BANDEJA;
    const params = this.parametrosBandeja(f);
    const direccion = f.orden === 'antiguos' ? 'ASC' : 'DESC';
    // Con orden por prioridad: Alta, Media, Normal y, dentro de cada una, lo más reciente primero.
    const primero = f.orden === 'prioridad' ? 'rango_prioridad, ' : '';
    const [{ total }] = await this.ds.query(`SELECT count(DISTINCT r.id_reporte)::int AS total ${desde}`, params);
    const filas: { id: number }[] = await this.ds.query(
      `SELECT DISTINCT r.id_reporte AS id, r.fecha_creacion,
              CASE r.prioridad WHEN 'Alta' THEN 0 WHEN 'Media' THEN 1 ELSE 2 END AS rango_prioridad ${desde}
       ORDER BY ${primero}r.fecha_creacion ${direccion}, r.id_reporte ${direccion}
       LIMIT $12 OFFSET $13`, [...params, tamano, (pagina - 1) * tamano]);

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
  async exportarCsv(f: FiltrosBandejaDto): Promise<string> {
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
       LIMIT $12`, [...this.parametrosBandeja(f), MAX_EXPORTACION]);
    const columnas = ['folio', 'fecha', 'estatus', 'municipio', 'colonia', 'actividad', 'menores', 'grupos', 'riesgo', 'actualizado'];
    const encabezado = ['Folio', 'Fecha', 'Estatus', 'Municipio', 'Colonia', 'Actividad', 'Menores', 'Grupos de edad', 'Riesgo percibido', 'Última actualización'];
    const lineas = [encabezado.map(celdaCsv).join(','), ...filas.map((x) => columnas.map((c) => celdaCsv(x[c])).join(','))];
    // BOM para que Excel abra los acentos correctamente.
    return `\uFEFF${lineas.join('\r\n')}\r\n`;
  }

  /** CU-09: detalle completo con bitácora y transiciones permitidas. */
  async detalle(id: number): Promise<ReporteDetalleDto> {
    const reporte = await this.ds.getRepository(Reporte).findOneBy({ id });
    if (!reporte) throw new NotFoundException('Reporte no encontrado');
    const [resumen] = await this.aplanar([reporte]);
    const rc = await this.ds.getRepository(ReporteCaso).findOneBy({ idReporte: id });
    const grupos = await this.ds.getRepository(GrupoMenores).find({ where: { idReporte: id } });
    const u = reporte.ubicacion;
    const historial = await this.bitacora(id);
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
    const filas: { estatus: string; comentario: string | null; autor: string | null; fecha: Date }[] = await this.ds.query(
      `SELECT e.nombre AS estatus, s.comentario, u.correo AS autor, s.fecha
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

    return reportes.map((r) => ({
      id: r.id,
      folio: folioPor.get(r.id) ?? '',
      estatus: casoPor.get(r.id)?.estatus.nombre ?? ESTATUS_INICIAL,
      estatusEtiqueta: etiquetaEstatus(casoPor.get(r.id)?.estatus.nombre ?? ESTATUS_INICIAL),
      prioridad: r.prioridad,
      peligroInmediato: r.peligroInmediato,
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
