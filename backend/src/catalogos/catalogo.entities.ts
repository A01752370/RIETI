import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Catálogos del ER de la Etapa 2. Se siembran en la migración inicial. */

@Entity('municipio')
export class Municipio {
  @PrimaryGeneratedColumn({ name: 'id_municipio' })
  id: number;

  @Column({ length: 120 })
  nombre: string;

  @Column({ length: 80 })
  estado: string;
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
}

@Entity('estatus_reporte')
export class EstatusReporte {
  @PrimaryGeneratedColumn({ name: 'id_estatus' })
  id: number;

  @Column({ length: 40, unique: true })
  nombre: string;

  @Column({ type: 'smallint' })
  orden: number;
}
