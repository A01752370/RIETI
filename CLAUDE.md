# CLAUDE.md — RIETI (SIPINNA Atizapán de Zaragoza)

Instrucciones permanentes para cualquier sesión de Claude Code en este repositorio. Léelas completas antes de tocar código. El plan de trabajo vigente está en `docs/PLAN-RIETI.md`.

## Qué es el proyecto
Plataforma para que la ciudadanía reporte, de forma anónima o con medio de contacto, posibles situaciones de trabajo infantil en la **Ruta Intermunicipal (Estado de México)**, y para que el personal del SIPINNA municipal les dé seguimiento hasta concluirlos o canalizarlos. Proyecto del curso *Construcción de software y toma de decisiones (Gpo 402)*, Tec de Monterrey, 5.º semestre, equipo de 5 personas, con socio formador.

**Se manejan datos sensibles ligados a niñas, niños y adolescentes.** La privacidad y la seguridad tienen prioridad sobre la comodidad o la velocidad.

El sistema **no** realiza inspecciones, no emite resoluciones y no constituye denuncia formal ante el Ministerio Público.

## Fuentes de verdad (en este orden)
1. Decisiones vigentes D-01…D-15 en `docs/PLAN-RIETI.md` §2.
2. Etapa 1 (Requerimientos: RF-01…RF-49, RNF-01…RNF-41, casos de uso, estatus) y Etapa 2 (Diseño: ER, arquitectura, seguridad, Figma). Están en el Project SIPINNA de claude.ai.
3. El código actual. Si el código contradice a los documentos, **repórtalo**, no lo arregles en silencio.

## Estructura del monorepo
```
/                     App Android (Kotlin, Jetpack Compose) — módulo :app
backend/              API NestJS + TypeORM + PostgreSQL/PostGIS
web/                  Plataforma web React + TypeScript (Vite)   [por crear]
infra/terraform/      Infraestructura AWS (IaC)
docs/                 Documentación de la Etapa 3 (ver plan §11)
.github/workflows/    CI
```

## Stack
- **Android:** Kotlin 1.9.24, Compose BOM 2024.06.00 (compiler ext. 1.5.14), Material 3, MVVM (`ViewModel` + `StateFlow`), Navigation Compose, Retrofit + Gson + OkHttp, Coil, Play Services Location. AGP 8.13.2, Gradle 8.13, minSdk 26, compile/targetSdk 34. Catálogo de versiones en `gradle/libs.versions.toml`. **No actualices AGP/Kotlin/Gradle sin que se pida.** JDK: el embebido de Android Studio (17/21), no JDK 25.
- **Backend:** Node.js LTS + NestJS 10, TypeORM, PostgreSQL 16 + PostGIS, `class-validator`.
- **Web:** React + TypeScript.
- **AWS:** CloudFront + WAF → ALB → ECS Fargate; RDS PostgreSQL; S3 (evidencias, web); Cognito. Terraform. Sin Route 53/ACM (dominio `*.cloudfront.net`).

## Comandos
```bash
# Android
./gradlew assembleDebug testDebugUnitTest lint
./gradlew assembleDebug -Prieti.apiUrl=http://10.0.2.2:3000/     # backend local desde el emulador

# Backend
cd backend && npm ci && npm run start:dev && npm test && npm run lint && npm run build

# Infra (solo lectura sin aprobación)
cd infra/terraform && terraform fmt -check && terraform validate && terraform plan
```

## Reglas duras (no negociables)
1. **Nunca** escribas, imprimas, registres ni commitees secretos: llaves de AWS, tokens de GitHub, contraseñas, `*.tfstate`, `*.tfvars` reales, `.env`, `local.properties`. Si ves uno, detente y avisa al usuario. Los secretos vienen de variables de entorno / Secrets Manager.
2. **No ejecutes** `terraform apply`, `terraform destroy`, ni comandos de AWS que creen, modifiquen o borren recursos, ni `git push --force`, **sin aprobación explícita** del usuario en ese momento. Lectura (`plan`, `describe`, `get`, `list`) sí.
3. **Opera solo sobre recursos de este proyecto** (etiqueta `Project=RIETI` y prefijo `rieti`, región `mx-central-1`). No modifiques ni leas otros recursos de la cuenta (D-09).
4. **Sin PII en logs, ejemplos, pruebas ni datos semilla.** Nunca se solicita ni almacena nombre, CURP ni domicilio del menor (RNF-27).
5. **Anónimo es anónimo:** no persistas IP, ID de dispositivo ni ID de publicidad en reportes anónimos (RNF-29). La ubicación del dispositivo del reportante no se guarda (RNF-28); solo la ubicación del lugar de los hechos.
6. **Cada endpoint de personal lleva guard** (JWT + rol) y pasa por RLS. Ninguna ruta nueva sin decisión explícita de si es pública.
7. **Consultas SQL siempre parametrizadas.** DTOs con `whitelist` y `forbidNonWhitelisted`. Nada de `synchronize: true` fuera de desarrollo local: usa migraciones.
8. **Android release sin texto claro (HTTP).** El permiso para `10.0.2.2` vive solo en `src/debug`.
9. **No rotules como "hecho" algo que no verificaste.** Si no pudiste compilar, correr o probar, dilo.
10. **Una pregunta al usuario solo si es una decisión suya** (producto, costo, alcance, algo irreversible). Lo demás, decide con criterio y deja constancia.

## Convenciones
- **Idioma:** documentación, KDoc/TSDoc, mensajes de UI y comentarios en **español**; identificadores de código en el idioma ya usado en el archivo (la base actual mezcla español/inglés: respeta lo existente y no renombres masivamente).
- **Documentación de código obligatoria:** KDoc en Kotlin, TSDoc/JSDoc en TypeScript, para toda clase, función y DTO públicos. Es un criterio de calificación.
- **Git:** ramas `feat/…`, `fix/…`, `docs/…`, `chore/…`; PR pequeños hacia `main`; commits en español con prefijo convencional (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). **No añadas líneas `Co-Authored-By` ni atribuciones a los commits** (preferencia del usuario).
- **API:** prefijo `/api/v1`, errores con formato único `{codigo, mensaje, detalle?}`, contrato en OpenAPI (`@nestjs/swagger`).
- **Estatus de reporte (canónico, Etapa 1):** Recibido → En revisión → En atención → Canalizado → Concluido / Descartado. Respeta la tabla de transiciones (plan §6). `Descartado` exige motivo.
- **Folio:** `RIETI-AAAA-NNNNNN` + clave de consulta aleatoria (hash Argon2id). La consulta pública exige ambos y se hace por `POST`.
- **Pruebas:** toda lógica de negocio, autorización y RLS lleva prueba automatizada.
- **Android:** capas `view → viewmodel → repository → network`; estados con `UiState` sellado; sin lógica de negocio en composables; tokens solo en almacenamiento cifrado.
- **Dependencias:** no agregues una si la plataforma o una existente ya lo resuelve; versiones fijas; justifica en el PR.

## Definición de terminado
Código documentado (KDoc/TSDoc) · pruebas pasando · lint limpio · CI verde · sin secretos (`gitleaks`) · sin PII en logs · criterios de aceptación del plan verificados · documentación (`docs/`) actualizada.

## Entregables de documentación (Etapa 3)
Mantén actualizados mientras avanzas, no al final: `docs/arquitectura/{movil,web,backend,aws}.md`, `docs/interconectividad.md`, `docs/api/openapi.json`, `docs/seguridad/{identificacion-ataques,metodos-proteccion}.md`, `docs/reuniones/`. Detalle y mapeo a la rúbrica: plan §11.

## Cómo reportar al usuario
El usuario (Braulio "Bowser", responsable de la app Android) es estudiante de ITC, trabaja con capturas de pantalla y prefiere **pasos concretos, uno a uno**, en español informal. Cuando le pidas que haga algo en Android Studio, la terminal o la consola de AWS, dile exactamente dónde hacer clic o qué comando pegar. Al terminar una tarea: qué cambió, qué verificaste de verdad, qué falta y el siguiente paso natural.

## Pendientes del equipo que NO son tuyos
Rotación de credenciales (AWS `rieti` y GitHub), correos de alertas, creación del primer administrador de Cognito (lo hace quien administre la cuenta de AWS), actas de reunión. Recuérdalos si el trabajo los toca, pero no los ejecutes.
