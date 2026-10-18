import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Catálogos del ER de la Etapa 2. Se siembran en la migración inicial. */

/** Municipio del catálogo (D-16): los 125 del Estado de México, con su clave INEGI. */
@Entity('municipio')
export class Municipio {
  @PrimaryGeneratedColumn({ name: 'id_municipio' })
  id: number;

  @Column({ length: 120 })
  nombre: string;

  @Column({ length: 80 })
  estado: string;

  /** Clave geoestadística de INEGI (`15xxx`). */
  @Column({ name: 'clave_inegi', type: 'varchar', length: 5, nullable: true })
  claveInegi: string | null;

  /** Si se ofrece en el selector del formulario. */
  @Column({ default: true })
  activo: boolean;

  /** Clave de 3 letras para el folio `RIETI-ATZ-2026-000123` (Fase 6; provisional salvo ATZ, NAU, TLA y CIZ). */
  @Column({ name: 'clave_folio', type: 'varchar', length: 3, nullable: true })
  claveFolio: string | null;
}

/** Contacto institucional de un municipio de la red (D-17). */
@Entity('contacto_municipio')
export class ContactoMunicipio {
  @PrimaryGeneratedColumn({ name: 'id_contacto' })
  id: number;

  @ManyToOne(() => Municipio, { nullable: false })
  @JoinColumn({ name: 'id_municipio' })
  municipio: Municipio;

  /** `correo` o `enlace`. */
  @Column({ type: 'varchar', length: 10 })
  tipo: 'correo' | 'enlace';

  @Column({ type: 'varchar', length: 300 })
  valor: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  etiqueta: string | null;

  /** true mientras el dato sea de ejemplo (dominio example.org). */
  @Column({ name: 'es_ejemplo', default: false })
  esEjemplo: boolean;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}

@Entity('rol_usuario')
export class RolUsuario {
  @PrimaryGeneratedColumn({ name: 'id_rol' })
  id: number;

  @Column({ length: 60, unique: true })
  nombre: string;

  /** true para roles de personal SIPINNA con acceso al panel. */
  @Column({ name: 'es_personal', default: false })
  esPersonal: boolean;
}

@Entity('actividad')
export class Actividad {
  @PrimaryGeneratedColumn({ name: 'id_actividad' })
  id: number;

  @Column({ length: 80, unique: true })
  nombre: string;

  /** Posición en el selector ("Otro" y "No sé" al final). */
  @Column({ type: 'smallint', default: 100 })
  orden: number;

  /** false para actividades heredadas que ya no se ofrecen (siguen siendo válidas para reportes anteriores). */
  @Column({ default: true })
  vigente: boolean;
}

@Entity('riesgo')
export class Riesgo {
  @PrimaryGeneratedColumn({ name: 'id_riesgo' })
  id: number;

  @Column({ length: 20, unique: true })
  nombre: string;
}

@Entity('rango_edad')
export class RangoEdad {
  @PrimaryGeneratedColumn({ name: 'id_rango_edad' })
  id: number;

  @Column({ length: 20, unique: true })
  nombre: string;

  /** Posición en el formulario y en las gráficas. */
  @Column({ type: 'smallint', default: 100 })
  orden: number;

  /** false para `12-17`, que solo queda como valor heredado (Fase 6). */
  @Column({ default: true })
  vigente: boolean;
}

@Entity('estatus_reporte')
export class EstatusReporte {
  @PrimaryGeneratedColumn({ name: 'id_estatus' })
  id: number;

  @Column({ length: 40, unique: true })
  nombre: string;

  @Column({ type: 'smallint' })
  orden: number;

  /** Nombre público del catálogo del socio (Recibido → Registrado, etc.; Fase 6). */
  @Column({ length: 40 })
  etiqueta: string;
}
