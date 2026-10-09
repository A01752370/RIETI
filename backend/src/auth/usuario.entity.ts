import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Municipio, RolUsuario } from '../catalogos/catalogo.entities';

/**
 * Personal SIPINNA. La contraseña NO se guarda aquí: la gestiona Cognito.
 * La fila se crea o actualiza en el primer inicio de sesión (vínculo por `cognito_sub`).
 */
@Entity('usuario')
export class Usuario {
  @PrimaryGeneratedColumn({ name: 'id_usuario' })
  id: number;

  @Column({ length: 254, unique: true })
  correo: string;

  @Column({ name: 'cognito_sub', type: 'uuid', unique: true })
  cognitoSub: string;

  @ManyToOne(() => RolUsuario, { nullable: false, eager: true })
  @JoinColumn({ name: 'id_rol' })
  rol: RolUsuario;

  @ManyToOne(() => Municipio, { nullable: true })
  @JoinColumn({ name: 'id_municipio' })
  municipio: Municipio | null;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;
}
