import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne,
  PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Actividad, EstatusReporte, Municipio, RangoEdad, Riesgo } from '../catalogos/catalogo.entities';
import { Usuario } from '../auth/usuario.entity';

/** Transforma `decimal` (string en pg) a number. */
const decimalANumero = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null ? null : Number(v)),
};

/**
 * Ubicación del reporte. Además de lat/lng, la migración agrega la columna
 * generada `punto geography(Point,4326)` con índice GiST para consultas
 * territoriales con PostGIS (RNF-19). No se mapea aquí porque es de solo lectura.
 */
@Entity('ubicacion')
export class Ubicacion {
  @PrimaryGeneratedColumn({ name: 'id_ubicacion' })
  id: number;

  @Column({ type: 'varchar', length: 300 })
  descripcion: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: decimalANumero })
  latitud: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: decimalANumero })
  longitud: number | null;
}

@Entity('reporte')
export class Reporte {
  @PrimaryGeneratedColumn({ name: 'id_reporte' })
  id: number;

  @OneToOne(() => Ubicacion, { cascade: ['insert'], nullable: false, eager: true })
  @JoinColumn({ name: 'id_ubicacion' })
  ubicacion: Ubicacion;

  @ManyToOne(() => Municipio, { nullable: true })
  @JoinColumn({ name: 'id_municipio' })
  municipio: Municipio | null;

  @ManyToOne(() => Actividad, { nullable: false, eager: true })
  @JoinColumn({ name: 'id_actividad' })
  actividad: Actividad;

  @ManyToOne(() => Riesgo, { nullable: false, eager: true })
  @JoinColumn({ name: 'id_riesgo' })
  riesgo: Riesgo;

  @ManyToOne(() => RangoEdad, { nullable: false, eager: true })
  @JoinColumn({ name: 'id_rango_edad' })
  rangoEdad: RangoEdad;

  @Column({ name: 'cantidad_ninos', type: 'smallint' })
  cantidadNinos: number;

  @Column({ type: 'text' })
  descripcion: string;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}

/** Folio público `RIETI-<año>-<consecutivo>`; el consecutivo sale de `folio_contador`. */
@Entity('folio')
export class Folio {
  @PrimaryGeneratedColumn({ name: 'id_folio' })
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  codigo: string;

  @Column({ type: 'smallint' })
  anio: number;

  @Column({ type: 'integer' })
  consecutivo: number;

  @OneToOne(() => Reporte, { nullable: false })
  @JoinColumn({ name: 'id_reporte' })
  reporte: Reporte;
}

@Entity('caso')
export class Caso {
  @PrimaryGeneratedColumn({ name: 'id_caso' })
  id: number;

  @ManyToOne(() => EstatusReporte, { nullable: false, eager: true })
  @JoinColumn({ name: 'id_estatus' })
  estatus: EstatusReporte;

  @CreateDateColumn({ name: 'fecha_apertura', type: 'timestamptz' })
  fechaApertura: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}

/** Relación N:M Reporte–Caso (varios reportes pueden agruparse en un caso). */
@Entity('reporte_caso')
export class ReporteCaso {
  @PrimaryColumn({ name: 'id_reporte' })
  idReporte: number;

  @PrimaryColumn({ name: 'id_caso' })
  idCaso: number;

  @ManyToOne(() => Reporte, { nullable: false })
  @JoinColumn({ name: 'id_reporte' })
  reporte: Reporte;

  @ManyToOne(() => Caso, { nullable: false, eager: true })
  @JoinColumn({ name: 'id_caso' })
  caso: Caso;
}

/** Historial append-only de acciones sobre un caso (bitácora, RNF-21). */
@Entity('seguimiento')
export class Seguimiento {
  @PrimaryGeneratedColumn({ name: 'id_seguimiento' })
  id: number;

  @ManyToOne(() => Caso, { nullable: false })
  @JoinColumn({ name: 'id_caso' })
  caso: Caso;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario | null;

  @ManyToOne(() => EstatusReporte, { nullable: false, eager: true })
  @JoinColumn({ name: 'id_estatus' })
  estatus: EstatusReporte;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;
}
