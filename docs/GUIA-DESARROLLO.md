# Guía de desarrollo — RIETI (SIPINNA Atizapán de Zaragoza)

Reglas y convenciones permanentes del proyecto para cualquier persona que contribuya al repositorio. Léela completa antes de tocar código. El plan de trabajo vigente está en [`PLAN-RIETI.md`](PLAN-RIETI.md) y el estado de la entrega en [`ESTADO-ENTREGA.md`](ESTADO-ENTREGA.md).

## Qué es el proyecto
Plataforma para que la ciudadanía reporte, de forma anónima, posibles situaciones de trabajo infantil en la **Ruta Intermunicipal (Estado de México)**, y para que el personal del SIPINNA municipal les dé seguimiento hasta concluirlos o canalizarlos. Proyecto del curso *Construcción de software y toma de decisiones (Gpo 402)*, Tec de Monterrey, 5.º semestre, equipo de 5 personas, con socio formador.

**Se manejan datos sensibles ligados a niñas, niños y adolescentes.** La privacidad y la seguridad tienen prioridad sobre la comodidad o la velocidad.

El sistema **no** realiza inspecciones, no emite resoluciones y no constituye denuncia formal ante el Ministerio Público.

## Fuentes de verdad (en este orden)
1. Decisiones vigentes (D-01 en adelante) en [`PLAN-RIETI.md`](PLAN-RIETI.md) §2.
2. Etapa 1 (Requerimientos: RF-01…RF-49, RNF-01…RNF-41, casos de uso, estatus) y Etapa 2 (Diseño: ER, arquitectura, seguridad, Figma), en la carpeta compartida del equipo.
3. El código actual. Si el código contradice a los documentos, **se reporta al equipo**; no se corrige en silencio.

## Estructura del monorepo
```
/                     App Android (Kotlin, Jetpack Compose) — módulo :app
backend/              API NestJS + TypeORM + PostgreSQL/PostGIS
web/                  Plataforma web React + TypeScript (Vite), servida por el backend
infra/terraform/      Infraestructura AWS (IaC)
docs/                 Documentación de la Etapa 3
.github/workflows/    CI/CD
```

## Stack
- **Android:** Kotlin 1.9.24, Compose BOM 2024.06.00 (compiler ext. 1.5.14), Material 3, MVVM (`ViewModel` + `StateFlow`), Navigation Compose, Retrofit + Gson + OkHttp, Play Services Location. AGP 8.13.2, Gradle 8.13, minSdk 26, compile/targetSdk 34. Catálogo de versiones en `gradle/libs.versions.toml`. **No se actualizan AGP, Kotlin ni Gradle sin acuerdo del equipo.** JDK: el JBR 17/21 de Android Studio; JDK 25 no funciona con Kotlin 1.9.24.
- **Backend:** Node.js 24 LTS + NestJS 11, TypeORM, PostgreSQL 16 + PostGIS, `class-validator`.
- **Web:** React 19 + TypeScript (Vite), sin dependencias externas en tiempo de ejecución y con CSP estricta.
- **AWS:** CloudFront + WAF → ALB interno → ECS Fargate; RDS PostgreSQL; S3; Cognito. Terraform. Sin Route 53/ACM (dominio `*.cloudfront.net`).

## Comandos
```bash
# Android
./gradlew assembleDebug testDebugUnitTest lint
./gradlew assembleDebug -Prieti.apiUrl=http://10.0.2.2:3000/     # backend local desde el emulador

# Backend
cd backend && npm ci && npm run build && npm test     # unitarias
npm run test:e2e                                      # requiere PostgreSQL + PostGIS (ver backend/README.md)

# Web
cd web && npm ci && npm run typecheck && npm test && npm run build

# Infra (solo lectura sin aprobación)
cd infra/terraform && terraform fmt -check && terraform validate && terraform plan
```

## Reglas duras (no negociables)
1. **Nunca** se escriben, imprimen, registran ni versionan secretos: llaves de AWS, tokens de GitHub, contraseñas, `*.tfstate`, `*.tfvars` reales, `backend.hcl`, `.env`, `local.properties`. Si aparece uno, se detiene el trabajo y se avisa al equipo. Los secretos vienen de variables de entorno o de Secrets Manager.
2. **No se ejecuta** `terraform apply`, `terraform destroy`, ni comandos de AWS que creen, modifiquen o borren recursos, ni `git push --force`, **sin aprobación explícita** de quien administra la cuenta. Lectura (`plan`, `describe`, `get`, `list`) sí.
3. **Solo se opera sobre recursos de este proyecto** (etiqueta `Project=RIETI` y prefijo `rieti`, región `mx-central-1`). No se modifican ni leen otros recursos de la cuenta (D-09).
4. **Sin PII en logs, ejemplos, pruebas ni datos semilla.** Nunca se solicita ni almacena nombre, CURP ni domicilio del menor (RNF-27).
5. **Anónimo es anónimo:** no se persiste IP, ID de dispositivo ni ID de publicidad en reportes anónimos (RNF-29). La ubicación del dispositivo de quien reporta no se guarda (RNF-28); solo la del lugar de los hechos.
6. **Cada endpoint de personal lleva guard** (JWT + permiso de `MATRIZ_PERMISOS`). Ninguna ruta nueva sin decisión explícita de si es pública (`@Publico()`), y el inventario de rutas públicas de `backend/test/rutas-protegidas.spec.ts` se actualiza en el mismo cambio.
7. **Consultas SQL siempre parametrizadas.** DTOs con `whitelist` y `forbidNonWhitelisted`. Nada de `synchronize: true` fuera de desarrollo local: se usan migraciones, solo aditivas y reversibles.
8. **Android release sin texto claro (HTTP).** El permiso para `10.0.2.2` vive solo en `src/debug`.
9. **No se rotula como "hecho" algo que no se verificó.** Si no se pudo compilar, correr o probar, se dice.
10. **Compatibilidad hacia atrás del API:** hay APK instaladas; un cambio de contrato no rompe el formato anterior sin un periodo de transición.

## Convenciones
- **Idioma:** documentación, KDoc/TSDoc, mensajes de UI y comentarios en **español**; identificadores de código en el idioma ya usado en el archivo (la base mezcla español/inglés: se respeta lo existente y no se renombra masivamente).
- **Documentación de código obligatoria:** KDoc en Kotlin y TSDoc/JSDoc en TypeScript para toda clase, función y DTO públicos. Es un criterio de calificación.
- **Git:** ramas `feature/…`, `feat/…`, `fix/…`, `docs/…`, `chore/…`; PR pequeños hacia `main` con CI en verde; commits en español con prefijo convencional (`feat:`, `fix:`, `docs:`, `chore:`, `test:`), sin líneas de coautoría ni pies de página generados.
- **API:** prefijo `/api/v1`, errores con formato único `{codigo, mensaje, detalle?}`, contrato en `docs/api/openapi.json` (lo verifica `backend/test/openapi.spec.ts`).
- **Estatus de reporte (canónico, Etapa 1):** Recibido → En revisión → En atención → Canalizado → Concluido / Descartado. Se respeta la tabla de transiciones (plan §6). `Descartado` exige motivo.
- **Folio:** `RIETI-AAAA-NNNNNN` + clave de consulta aleatoria (hash Argon2id). La consulta pública exige ambos y se hace por `POST`.
- **Pruebas:** toda lógica de negocio y de autorización lleva prueba automatizada.
- **Android:** capas `view → viewmodel → repository → network`; estados con `UiState` sellado; sin lógica de negocio en composables; tokens solo en almacenamiento cifrado.
- **Dependencias:** no se agrega una si la plataforma o una existente ya lo resuelve; versiones fijas; se justifica en el PR.
- **Seguridad:** todo cambio que abra o cierre superficie de ataque se documenta en `docs/seguridad/`.

## Definición de terminado
Código documentado (KDoc/TSDoc) · pruebas pasando · lint limpio · CI verde · sin secretos (`gitleaks`) · sin PII en logs · criterios de aceptación del plan verificados · documentación (`docs/`) actualizada.

## Entregables de documentación (Etapa 3)
Se mantienen al día durante el desarrollo, no al final: `docs/arquitectura/{movil,web,backend,aws}.md`, `docs/interconectividad.md`, `docs/api/openapi.json`, `docs/seguridad/{identificacion-ataques,metodos-proteccion,roles-y-permisos}.md`, `docs/reuniones/`. Detalle y mapeo a la rúbrica: plan §11.

## Pendientes operativos del equipo
Rotación de credenciales (AWS y GitHub), correos de alertas, creación del primer administrador de Cognito (lo hace quien administra la cuenta de AWS) y actas de reunión.
