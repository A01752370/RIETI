# RIETI

Plataforma para que la ciudadanía reporte, de forma anónima, posibles situaciones de trabajo infantil en la **Ruta Intermunicipal (Estado de México)**, y para que el personal del **SIPINNA de Atizapán de Zaragoza** les dé seguimiento.

Proyecto del curso *Construcción de software y toma de decisiones (Gpo 402)*, Tecnológico de Monterrey, con socio formador.

> RIETI no realiza inspecciones, no emite resoluciones y no constituye una denuncia formal ante el Ministerio Público. Si hay peligro inmediato, llama al 911.

## Componentes

| Carpeta | Qué es | Tecnología |
|---|---|---|
| [`app/`](app) | App Android (ciudadano y personal SIPINNA) | Kotlin, Jetpack Compose, Material 3, Retrofit |
| [`backend/`](backend) | API REST `/api/v1` | Node.js 24, NestJS 11, TypeORM, PostgreSQL 16 + PostGIS |
| [`infra/terraform/`](infra/terraform) | Infraestructura en AWS (`mx-central-1`) | Terraform: CloudFront + WAF, ALB, ECS Fargate, RDS, Cognito, S3, KMS |
| [`infra/sql/`](infra/sql) | Scripts de base de datos (rol de mínimo privilegio) | SQL |
| [`.github/workflows/`](.github/workflows) | CI/CD | GitHub Actions (OIDC hacia AWS) |
| [`docs/`](docs) | Documentación de la Etapa 3 | Markdown, OpenAPI |

## Documentación

| Tema | Documento |
|---|---|
| Arquitectura móvil | [docs/arquitectura/movil.md](docs/arquitectura/movil.md) |
| Arquitectura del backend | [docs/arquitectura/backend.md](docs/arquitectura/backend.md) |
| Arquitectura en AWS (incluye desviaciones del diseño) | [docs/arquitectura/aws.md](docs/arquitectura/aws.md) |
| Interconectividad app ↔ backend | [docs/interconectividad.md](docs/interconectividad.md) |
| Contrato del API (OpenAPI 3) | [docs/api/openapi.json](docs/api/openapi.json) |
| Identificación de ataques | [docs/seguridad/identificacion-ataques.md](docs/seguridad/identificacion-ataques.md) |
| Métodos de protección | [docs/seguridad/metodos-proteccion.md](docs/seguridad/metodos-proteccion.md) |
| Actas de reunión | [docs/reuniones/](docs/reuniones) |
| Estado de la entrega | [docs/ESTADO-ENTREGA.md](docs/ESTADO-ENTREGA.md) |
| Operación en AWS | [docs/RUNBOOK-AWS.md](docs/RUNBOOK-AWS.md) |
| Guion de prueba de la app | [docs/PRUEBA-APP.md](docs/PRUEBA-APP.md) |
| Plan de trabajo y decisiones del equipo | [docs/PLAN-RIETI.md](docs/PLAN-RIETI.md) |

## Cómo correr cada parte

### App Android

Requisitos: Android Studio con **JDK 17 o 21** como Gradle JDK (con JDK 25 el build falla).

```bash
./gradlew assembleDebug testDebugUnitTest lintDebug
# Contra un backend local desde el emulador:
./gradlew assembleDebug -Prieti.apiUrl=http://10.0.2.2:3000/
```

Por defecto la app usa el API desplegado en CloudFront.

### Backend

Requisitos: Node.js ≥ 24.7 y PostgreSQL 16 con PostGIS.

```bash
cd backend
npm ci
npm run build
npm test                         # pruebas unitarias
E2E_DB_PORT=5432 E2E_DB_PASSWORD=<contraseña local> npm run test:e2e   # pruebas e2e (crean la base rieti_e2e)
cp .env.example .env             # configurar la conexión local
set -a && . ./.env && set +a && npm start
```

Detalles en [backend/README.md](backend/README.md).

### Infraestructura

Ver [infra/README.md](infra/README.md) y el [runbook](docs/RUNBOOK-AWS.md). Los cambios en AWS se aplican solo con aprobación del responsable de la cuenta.

## Seguridad y privacidad

- Reportes anónimos: sin IP, identificadores del dispositivo ni datos del menor que lo identifiquen.
- Consulta ciudadana con folio + clave aleatoria (solo se guarda su hash Argon2id).
- Rutas del personal protegidas con JWT de Cognito y roles; todo se deniega por defecto.
- Repositorio público: sin secretos (verificado con `gitleaks` en cada push).

Para reportar un problema de seguridad, contacta al equipo en privado; no abras un *issue* público.
