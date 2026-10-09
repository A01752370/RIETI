# RIETI — Backend (NestJS)

API REST que consume la app Android (`app/network/ApiService.kt`). Corre en AWS ECS Fargate
detrás de CloudFront → ALB interno, con PostgreSQL 16 + PostGIS en RDS y autenticación con Amazon Cognito.

## Endpoints

| Método | Ruta | Acceso | Caso de uso |
|---|---|---|---|
| `POST` | `/reportes` | Público (10/min por IP) | CU-04 registrar reporte |
| `GET` | `/reportes` | Personal (JWT, grupo `Administrador` o `PersonalSIPINNA`) | CU-09 listado |
| `GET` | `/reportes/folio/:folio` | Público (20/min) — anónimo recibe **solo estatus y fechas**; personal recibe el reporte completo | CU-08 seguimiento |
| `PATCH` | `/reportes/:id` | Personal (JWT) | CU-09/10 estatus + seguimiento |
| `POST` | `/auth/login` | Público (5/min) | Login con Cognito; devuelve `accessToken` |
| `GET` | `/health` | Público | Liveness (ALB) |
| `GET` | `/health/ready` | Público | Readiness (verifica BD) |

## Decisiones

- **Sin `synchronize`**: el esquema se crea con migraciones (`src/database/migrations`), que corren al arrancar.
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

Las rutas de personal requieren un pool de Cognito (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`).

## Despliegue

Automático con GitHub Actions (`.github/workflows/backend.yml`) en cada push a `main` que toque `backend/`:
tests → imagen ARM64 → ECR (tag = SHA del commit, inmutable) → nueva revisión de task definition → ECS con rollback automático.
La autenticación con AWS es por OIDC; no hay access keys en GitHub. La infraestructura está en `infra/terraform`.

## Alta de personal

```bash
POOL=<cognito_user_pool_id>
aws cognito-idp admin-create-user --user-pool-id $POOL --username persona@dominio.mx \
  --user-attributes Name=email,Value=persona@dominio.mx Name=email_verified,Value=true
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL --username persona@dominio.mx --group-name PersonalSIPINNA
```

Cognito envía una contraseña temporal; la app aún no implementa el cambio de contraseña inicial ni el reto MFA,
así que por ahora fija la contraseña con `admin-set-user-password --permanent`.
