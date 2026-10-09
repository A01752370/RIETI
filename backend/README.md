# RIETI — Backend (NestJS)

API REST que consume la app Android (`app/network/ApiService.kt`). Corre en AWS ECS Fargate
detrás de CloudFront → ALB interno, con PostgreSQL 16 + PostGIS en RDS y autenticación con Amazon Cognito.

## Endpoints

Prefijo `/api/v1` (salvo `/health`). Contrato completo en [docs/api/openapi.json](../docs/api/openapi.json); arquitectura en [docs/arquitectura/backend.md](../docs/arquitectura/backend.md).

| Método | Ruta | Acceso | Caso de uso |
|---|---|---|---|
| `POST` | `/api/v1/reportes` | Público (5/min por IP) | CU-04 registrar reporte; devuelve folio + clave de consulta |
| `POST` | `/api/v1/reportes/consulta` | Público (10/min por IP; bloqueo del folio tras 5 fallos) | CU-08 consulta con folio + clave |
| `GET` | `/api/v1/reportes` | Personal (JWT, grupo `Administrador` o `PersonalSIPINNA`) | CU-09 bandeja paginada |
| `GET` | `/api/v1/reportes/:id` | Personal | CU-09 detalle con bitácora |
| `PATCH` | `/api/v1/reportes/:id/estatus` | Personal | CU-09/10 cambio de estatus (máquina de estados) |
| `POST` | `/api/v1/reportes/:id/seguimientos` | Personal | Nota de seguimiento |
| `POST` | `/api/v1/auth/login` | Público (5/min) | Login con Cognito; devuelve `accessToken` |
| `GET` | `/api/v1/avisos-privacidad/vigente` | Público | CU-02 aviso de privacidad |
| `GET` | `/api/v1/catalogos` | Público | Catálogos del formulario |
| `GET` | `/health`, `/health/ready` | Público | Sondas del ALB y ECS |

Toda ruta exige JWT salvo las marcadas con `@Publico()`; la prueba `test/rutas-protegidas.spec.ts` falla si aparece una ruta pública no aprobada.

## Decisiones

- **Sin `synchronize`**: el esquema se crea con migraciones (`src/database/migrations`), que corren al arrancar (`DB_MIGRAR_AL_INICIAR=false` las desactiva).
- **Clave de consulta**: aleatoria, se entrega una sola vez y solo se guarda su hash Argon2id (`crypto.argon2` de Node.js ≥ 24.7).
- **Errores**: siempre `{codigo, mensaje, detalle?}` (`src/comun/filtro-errores.ts`).
- **PostGIS real**: `ubicacion.punto` es `geography(Point,4326)` generada desde lat/lng, con índice GiST.
- **Bitácora append-only**: un trigger impide `UPDATE`/`DELETE` en `seguimiento` (RNF-21); pgAudit activo en RDS.
- **Contraseñas fuera de la API**: Cognito gestiona credenciales, MFA y bloqueo. La API solo valida el JWT (firma, emisor, `client_id`, expiración) y los grupos.
- **Secreto de BD**: RDS lo genera y rota en Secrets Manager; la API lo relee con caché de 5 min, así que la rotación no requiere reiniciar.
- **TLS a RDS verificado** con el bundle de CAs de AWS incluido en la imagen.

## Desarrollo local

```bash
cp .env.example .env        # DB_SSL=false, DB_PASSWORD=...
docker run -d --name rieti-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rieti_db -p 5432:5432 postgis/postgis:16-3.4
npm ci && npm run build
set -a && . ./.env && set +a && npm start
```

## Pruebas

```bash
npm test                                            # unitarias
E2E_DB_PORT=5432 E2E_DB_PASSWORD=postgres npm run test:e2e                         # e2e contra PostgreSQL + PostGIS
E2E_COMO_RIETI_APP=1 E2E_DB_PORT=5432 E2E_DB_PASSWORD=postgres npm run test:e2e    # e2e conectado como rieti_app
```

Las e2e crean (y recrean) la base `rieti_e2e`; nunca apuntes `E2E_DB_*` a una base real.

Las rutas de personal requieren un pool de Cognito (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`).

## Despliegue

Automático con GitHub Actions (`.github/workflows/backend.yml`) en cada push a `main` que toque `backend/`:
tests → imagen ARM64 → ECR (tag = SHA del commit, inmutable) → nueva revisión de task definition → ECS con rollback automático.
La autenticación con AWS es por OIDC; no hay access keys en GitHub. La infraestructura está en `infra/terraform`.

## Alta de personal y administración

Ver [docs/RUNBOOK-AWS.md](../docs/RUNBOOK-AWS.md): alta con `admin-create-user` + `admin-set-user-password --permanent` + grupo (la app aún no soporta el cambio de contraseña inicial ni el reto MFA), y borrado de reportes de prueba con `node dist/scripts/borrar-reporte.js <folio> --confirmar` como tarea única de ECS.
