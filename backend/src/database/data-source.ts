import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { opcionesTypeOrm } from '../config/typeorm.config';

/** DataSource para el CLI de TypeORM (`npm run typeorm -- migration:run`). */
export default new DataSource({ ...opcionesTypeOrm(), migrationsRun: false });
