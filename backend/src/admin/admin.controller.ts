import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { DataSource } from 'typeorm';
import { Requiere } from '../auth/roles';
import { RequestAutenticado } from '../auth/jwt.guard';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Cuerpo de `PUT /api/v1/admin/personal/:id/municipios`: reemplaza la lista completa. */
export class AsignarMunicipiosDto {
  @IsArray()
  @ArrayMaxSize(125)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  municipios: number[];
}

/** Cuerpo de `PUT /api/v1/admin/configuracion`: claves conocidas con su nuevo valor. */
export class ActualizarConfiguracionDto {
  @IsObject()
  valores: Record<string, number>;
}

/** Cuerpo de `POST /api/v1/admin/dependencias`. */
export class CrearDependenciaDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;
}

/** Cuerpo de `PATCH /api/v1/admin/dependencias/:id`. */
export class EditarDependenciaDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  /** false la oculta del selector sin borrar los expedientes que la usan. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/** Filtros de `GET /api/v1/admin/accesos`. */
export class FiltroAccesosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idUsuario?: number;

  @IsOptional()
  @Matches(/^[A-Z0-9-]{4,30}$/, { message: 'folio no válido' })
  folio?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato AAAA-MM-DD' })
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamano = 50;
}

/** Persona del personal con sus municipios asignados. */
export interface PersonalDto {
  id: number;
  correo: string;
  perfil: string;
  activo: boolean;
  /** true para Administrador y Coordinador regional: ven todos los municipios. */
  regional: boolean;
  municipios: { id: number; nombre: string }[];
}

/** Parámetro editable. */
export interface ParametroDto {
  clave: string;
  valor: number;
  descripcion: string;
  minimo: number;
  maximo: number;
  fechaActualizacion: string;
}

/** Entrada de la bitácora de accesos. */
export interface AccesoDto {
  id: number;
  usuario: string;
  accion: string;
  folio: string | null;
  detalle: string | null;
  fecha: string;
}

/** Límites de cada parámetro (validación del lado del servidor). */
export const LIMITES_CONFIGURACION: Record<string, [number, number]> = {
  duplicados_radio_m: [25, 1000],
  duplicados_dias: [1, 365],
  alerta_radio_m: [25, 1000],
  alerta_dias: [1, 365],
  alerta_minimo: [2, 50],
  accesos_conservacion_dias: [90, 3650],
};

/**
 * Administración del personal y de los parámetros (Fase 7). Solo el Administrador:
 * asignaciones de municipios, dependencias, parámetros de duplicados y alertas, y la
 * bitácora de accesos (solo lectura).
 */
@Controller('admin')
export class AdminController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Requiere('personal.administrar')
  @Get('personal')
  async personal(): Promise<PersonalDto[]> {
    const filas: { id: number; correo: string; perfil: string; activo: boolean; municipios: { id: number; nombre: string }[] | null }[] =
      await this.ds.query(
        `SELECT u.id_usuario AS id, u.correo, r.nombre AS perfil, u.activo,
                (SELECT json_agg(json_build_object('id', m.id_municipio, 'nombre', m.nombre) ORDER BY m.nombre)
                 FROM asignacion_municipio a JOIN municipio m ON m.id_municipio = a.id_municipio
                 WHERE a.id_usuario = u.id_usuario) AS municipios
         FROM usuario u JOIN rol_usuario r ON r.id_rol = u.id_rol
         WHERE r.es_personal
         ORDER BY u.correo`);
    return filas.map((f) => ({
      id: Number(f.id), correo: f.correo, perfil: f.perfil === 'Personal SIPINNA' ? 'Enlace municipal' : f.perfil, activo: f.activo,
      regional: f.perfil === 'Administrador' || f.perfil === 'Coordinador regional', municipios: f.municipios ?? [],
    }));
  }

  /** Reemplaza los municipios asignados a una persona del personal. */
  @Requiere('personal.administrar')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Put('personal/:id/municipios')
  async asignar(@Param('id', ParseIntPipe) id: number, @Body() dto: AsignarMunicipiosDto): Promise<PersonalDto> {
    await this.ds.transaction(async (m) => {
      const [u] = await m.query(
        'SELECT 1 FROM usuario u JOIN rol_usuario r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1 AND r.es_personal', [id]);
      if (!u) throw new NotFoundException('Usuario no encontrado');
      const ids = [...new Set(dto.municipios)];
      const [{ n }] = await m.query('SELECT count(*)::int AS n FROM municipio WHERE id_municipio = ANY($1::int[])', [ids]);
      if (n !== ids.length) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: 'Algún municipio no existe' });
      await m.query('DELETE FROM asignacion_municipio WHERE id_usuario = $1 AND NOT (id_municipio = ANY($2::int[]))', [id, ids]);
      await m.query(
        `INSERT INTO asignacion_municipio (id_usuario, id_municipio) SELECT $1, x FROM unnest($2::int[]) AS x
         ON CONFLICT DO NOTHING`, [id, ids]);
    });
    return (await this.personal()).find((p) => p.id === id)!;
  }

  @Requiere('configuracion.editar')
  @Get('configuracion')
  async configuracion(): Promise<ParametroDto[]> {
    const filas: { clave: string; valor: string; descripcion: string; fecha_actualizacion: Date }[] =
      await this.ds.query('SELECT clave, valor, descripcion, fecha_actualizacion FROM configuracion ORDER BY clave');
    return filas.filter((f) => LIMITES_CONFIGURACION[f.clave]).map((f) => ({
      clave: f.clave, valor: Number(f.valor), descripcion: f.descripcion,
      minimo: LIMITES_CONFIGURACION[f.clave][0], maximo: LIMITES_CONFIGURACION[f.clave][1],
      fechaActualizacion: new Date(f.fecha_actualizacion).toISOString(),
    }));
  }

  /** Cambia uno o varios parámetros; claves desconocidas o fuera de rango → 400. */
  @Requiere('configuracion.editar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Put('configuracion')
  async actualizarConfiguracion(@Body() dto: ActualizarConfiguracionDto, @Req() req: RequestAutenticado): Promise<ParametroDto[]> {
    const entradas = Object.entries(dto.valores);
    if (entradas.length === 0) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: 'Indica al menos un parámetro' });
    for (const [clave, valor] of entradas) {
      const limites = LIMITES_CONFIGURACION[clave];
      if (!limites) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: `Parámetro desconocido: ${clave.slice(0, 40)}` });
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < limites[0] || valor > limites[1]) {
        throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: `${clave} debe ser un entero entre ${limites[0]} y ${limites[1]}` });
      }
    }
    await this.ds.transaction(async (m) => {
      for (const [clave, valor] of entradas) {
        await m.query('UPDATE configuracion SET valor = $2, fecha_actualizacion = now(), id_usuario = $3 WHERE clave = $1',
          [clave, valor, req.usuario!.idUsuario]);
      }
    });
    return this.configuracion();
  }

  /** Todas las dependencias (incluidas las inactivas) para administrarlas. */
  @Requiere('configuracion.editar')
  @Get('dependencias')
  async dependencias(): Promise<{ id: number; nombre: string; activo: boolean }[]> {
    const filas: { id: number; nombre: string; activo: boolean }[] =
      await this.ds.query('SELECT id_dependencia AS id, nombre, activo FROM dependencia ORDER BY orden, nombre');
    return filas.map((f) => ({ ...f, id: Number(f.id) }));
  }

  @Requiere('configuracion.editar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('dependencias')
  async crearDependencia(@Body() dto: CrearDependenciaDto): Promise<{ id: number; nombre: string; activo: boolean }> {
    const [existe] = await this.ds.query('SELECT 1 FROM dependencia WHERE lower(nombre) = lower($1)', [dto.nombre]);
    if (existe) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: 'Ya existe una dependencia con ese nombre' });
    const [fila] = await this.ds.query(
      'INSERT INTO dependencia (nombre, orden) VALUES ($1, 100) RETURNING id_dependencia AS id, nombre, activo', [dto.nombre]);
    return { ...fila, id: Number(fila.id) };
  }

  @Requiere('configuracion.editar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('dependencias/:id')
  async editarDependencia(@Param('id', ParseIntPipe) id: number, @Body() dto: EditarDependenciaDto): Promise<{ id: number; nombre: string; activo: boolean }> {
    if (dto.nombre !== undefined) {
      const [choca] = await this.ds.query('SELECT 1 FROM dependencia WHERE lower(nombre) = lower($1) AND id_dependencia <> $2', [dto.nombre, id]);
      if (choca) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: 'Ya existe una dependencia con ese nombre' });
    }
    // Con UPDATE … RETURNING el driver de TypeORM devuelve [filas, afectadas].
    const [filas] = await this.ds.query(
      `UPDATE dependencia SET nombre = coalesce($2, nombre), activo = coalesce($3, activo)
       WHERE id_dependencia = $1 RETURNING id_dependencia AS id, nombre, activo`, [id, dto.nombre ?? null, dto.activo ?? null]);
    const f = (filas as { id: number; nombre: string; activo: boolean }[])[0];
    if (!f) throw new NotFoundException('Dependencia no encontrada');
    return { ...f, id: Number(f.id) };
  }

  /** Bitácora de accesos a expedientes (solo lectura; append-only en la base). */
  @Requiere('accesos.ver')
  @Get('accesos')
  async accesos(@Query() f: FiltroAccesosDto): Promise<{ total: number; pagina: number; tamano: number; elementos: AccesoDto[] }> {
    const where = `WHERE ($1::int IS NULL OR a.id_usuario = $1::int)
        AND ($2::text IS NULL OR a.folio = $2::text)
        AND ($3::date IS NULL OR (a.fecha AT TIME ZONE 'America/Mexico_City')::date >= $3::date)
        AND ($4::date IS NULL OR (a.fecha AT TIME ZONE 'America/Mexico_City')::date <= $4::date)`;
    const params = [f.idUsuario ?? null, f.folio ?? null, f.desde ?? null, f.hasta ?? null];
    const [[{ total }], filas] = await Promise.all([
      this.ds.query(`SELECT count(*)::int AS total FROM acceso_expediente a ${where}`, params),
      this.ds.query(
        `SELECT a.id_acceso AS id, u.correo AS usuario, a.accion, a.folio, a.detalle, a.fecha
         FROM acceso_expediente a JOIN usuario u ON u.id_usuario = a.id_usuario ${where}
         ORDER BY a.fecha DESC, a.id_acceso DESC LIMIT $5 OFFSET $6`, [...params, f.tamano, (f.pagina - 1) * f.tamano]),
    ]) as [[{ total: number }], { id: string; usuario: string; accion: string; folio: string | null; detalle: string | null; fecha: Date }[]];
    return {
      total, pagina: f.pagina, tamano: f.tamano,
      elementos: filas.map((x) => ({ id: Number(x.id), usuario: x.usuario, accion: x.accion, folio: x.folio, detalle: x.detalle, fecha: new Date(x.fecha).toISOString() })),
    };
  }
}
