# Auditoría de la cuenta de AWS compartida

> **Fecha:** 10-oct-2026 · **Tipo:** solo lectura (no se aplicó ni modificó nada) · **Alcance:** cuenta de AWS donde se desplegó RIETI, que pertenece a otra persona y aloja otros proyectos.
> **Pregunta:** ¿afectó RIETI a recursos que no son suyos?
>
> Por tratarse de un repositorio público, este informe **no incluye** el ID de la cuenta, correos, identificadores de llaves, IDs de recursos ni nombres de los proyectos ajenos. Esos datos se compartieron por separado con el equipo.

## Conclusión

1. **No se encontró ninguna escritura de RIETI sobre recursos ajenos.** Las 148 escrituras hechas con la llave de RIETI y las 66 del rol de CI desde el 9-oct-2026 apuntan a recursos de la lista de la sección 1. La única excepción son los 5 *service-linked roles* del punto 3.
2. **En `mx-central-1` todo es de RIETI.** Los recursos que no tienen etiqueta (o que AWS creó automáticamente) pertenecen a la VPC, al servicio o a la base de datos de RIETI. Los proyectos ajenos están en `us-east-1`.
3. **Sí hubo un cambio a nivel de cuenta:** se crearon 5 *service-linked roles* de AWS (ECS, autoescalado de ECS, ELB, RDS y *VPC origins* de CloudFront). Son roles únicos por cuenta, administrados por AWS, y no modifican nada existente. Si el otro proyecto empieza a usar esos servicios, usará los mismos roles. **No deben borrarse.**
4. **Riesgo alto: la llave de RIETI tiene permisos de administrador sobre toda la cuenta.** No existe un usuario IAM `rieti`. La llave del perfil `rieti` pertenece al único usuario IAM de la cuenta, que es el de la persona dueña, con `AdministratorAccess` y sin *permissions boundary*. Técnicamente puede modificar o borrar cualquier recurso de la cuenta. Además, esa llave se compartió por un canal no seguro durante el desarrollo. Ver [Recomendaciones](#recomendaciones).

## Método y límites

| Paso | Fuente | Límite conocido |
|---|---|---|
| 1 | `terraform show -json` (estado remoto, solo lectura) | Solo incluye lo que gestiona Terraform; lo creado fuera de él se revisó aparte (bucket de estado, roles de servicio). |
| 2 | Resource Groups Tagging API en `mx-central-1` y `us-east-1` + conteo por servicio en `mx-central-1` (ECS, RDS, Lambda, DynamoDB, ECR, Secrets Manager, KMS, Cognito, Logs, SNS, ELB, API Gateway, CloudWatch, S3) | La API de etiquetas no ve recursos que nunca tuvieron etiqueta; por eso se agregó el conteo por servicio. De los recursos ajenos solo se vieron nombre y tipo. |
| 3 | CloudTrail `lookup-events` por usuario y por rol de CI, en `mx-central-1` y `us-east-1`, del 12-ago al 9-oct-2026; solo eventos con `readOnly=false` | Solo eventos de administración de los últimos 90 días (no incluye eventos de datos, como objetos de S3 o invocaciones de Lambda). Los eventos de los servicios globales (IAM, CloudFront, WAF, Budgets) están en `us-east-1`. |
| 4 | IAM: políticas del usuario, grupos y *permissions boundary* | — |
| 5 | Revisión de `.github/workflows/*.yml`, `infra/terraform/*.tf` e `infra/bootstrap.sh` | Los valores de las variables de GitHub (`vars.*`) no se pudieron leer sin sesión de GitHub CLI; se verificaron indirectamente con CloudTrail. |

## 1. Recursos creados por RIETI (estado de Terraform)

**88 recursos gestionados**, todos con prefijo `rieti`: 58 etiquetados y 30 de tipos que no admiten etiquetas (reglas, asociaciones, políticas en línea, configuraciones de bucket, grupos de Cognito).

**Etiquetas aplicadas:** `Project=RIETI`, `Environment=prod`, `ManagedBy=Terraform`, `Repository=A01752370/RIETI` y `Name`/`Tier` en los de red.

> ⚠️ **Discrepancia con D-09:** la decisión del equipo menciona la etiqueta `proyecto=rieti`, pero **ningún recurso la tiene**. La convención desplegada es `Project=RIETI`, y en esta auditoría se usó como equivalente.

| Tipo | Recursos (nombre) | Región |
|---|---|---|
| Red (VPC, subredes ×6, tablas de rutas ×3 y 6 asociaciones, IGW, NAT, EIP, endpoint S3, flow log) | `rieti-prod-vpc`, `rieti-prod-{publica,privada,datos}-mx-central-1{a,b}`, `rieti-prod-rt-*`, `rieti-prod-igw`, `rieti-prod-nat`, `rieti-prod-nat-eip`, `rieti-prod-vpce-s3` | mx-central-1 |
| Grupos de seguridad (×4) y reglas (×6) | `rieti-prod-alb`, `rieti-prod-api`, `rieti-prod-db`, SG por defecto de la VPC de RIETI (`rieti-prod-default-sin-uso`) | mx-central-1 |
| Balanceo | ALB `rieti-prod-alb`, *target group* `rieti-prod-api`, *listener* HTTP | mx-central-1 |
| Cómputo | Clúster `rieti-prod-cluster` (+ *capacity providers*), servicio y task definition `rieti-prod-api`, autoescalado (*target* + política `rieti-prod-api-cpu`) | mx-central-1 |
| Imágenes | ECR `rieti-backend` + política de ciclo de vida | mx-central-1 |
| Datos | RDS `rieti-prod-db`, *subnet group* `rieti-prod-db`, *parameter group* `rieti-prod-postgres16` | mx-central-1 |
| Almacenamiento | S3 `rieti-prod-evidencias-<cuenta>` y `rieti-prod-alb-logs-<cuenta>` + 12 configuraciones (cifrado, bloqueo público, ciclo de vida, versionado, propiedad, política) | mx-central-1 |
| Cifrado | KMS (CMK) + alias `alias/rieti-prod` | mx-central-1 |
| Identidad | Cognito `rieti-prod-personal`, cliente `rieti-prod-api`, grupos `Administrador` y `PersonalSIPINNA` | mx-central-1 |
| IAM (×4 roles, 4 políticas en línea, 1 adjunta) | `rieti-prod-ecs-ejecucion`, `rieti-prod-ecs-tarea`, `rieti-prod-vpc-flow-logs`, `rieti-prod-github-deploy` | global |
| Observabilidad | 4 *log groups* (`/ecs/rieti-prod-api`, `/vpc/rieti-prod/flow-logs`, `/aws/rds/instance/rieti-prod-db/*`), 5 alarmas `rieti-prod-*`, SNS `rieti-prod-alarmas` + política | mx-central-1 |
| Borde | CloudFront (distribución del API) + *VPC origin*, WAF `rieti-prod-api` | global / us-east-1 |
| Costos | Presupuesto `rieti-prod-mensual` (filtrado por `Project=RIETI`) | global |

**Creados fuera de Terraform por RIETI:**

| Recurso | Origen | Etiqueta |
|---|---|---|
| Bucket de estado `rieti-tfstate-<cuenta>-mx` | `infra/bootstrap.sh` | `Project=RIETI` |
| Revisiones de la task definition e imágenes en ECR | GitHub Actions (rol `rieti-prod-github-deploy`) | — |
| Secreto `rds!db-…` (contraseña maestra) | Lo crea y administra RDS para `rieti-prod-db` | Propietario: servicio RDS |
| SG `CloudFront-VPCOrigins-Service-SG` y 2 interfaces de red | Los crea CloudFront dentro de la VPC de RIETI | Sin etiqueta |
| 2 alarmas `TargetTracking-…rieti-prod-api-AlarmHigh/Low` | Las crea el autoescalado del servicio de RIETI | Sin etiqueta |
| 5 *service-linked roles* (ver conclusión 3) | Creados por AWS al usar ECS, ELB, RDS y CloudFront por primera vez | Administrados por AWS |

**Recurso ajeno del que RIETI depende:** el proveedor OIDC de GitHub (`token.actions.githubusercontent.com`) ya existía y lo administra otro proyecto. Terraform solo lo **lee** (`data`); el rol de despliegue de RIETI confía en él, pero no lo modifica. Si se borra, el despliegue continuo de RIETI deja de funcionar.

## 2. Recursos de la cuenta sin la etiqueta de RIETI

| Región | Recursos con etiqueta | Con `Project=RIETI` | Sin ella | Con `proyecto=rieti` |
|---|---|---|---|---|
| mx-central-1 | 60 | 55 | 5 | 0 |
| us-east-1 | 73 | 4 | 69 | 0 |

**mx-central-1:** los 5 recursos sin etiqueta son los derivados descritos en la sección 1 (SG y 2 interfaces de red de CloudFront en la VPC de RIETI, y 2 alarmas del autoescalado). El conteo por servicio confirma que en esta región **solo hay recursos de RIETI**: 1 clúster ECS, 1 RDS, 1 ECR, 1 pool de Cognito, 1 alias KMS, 1 secreto (el de RDS), 5 *log groups*, 1 tópico SNS, 1 ALB y 7 alarmas, todos de RIETI. Hay 0 Lambda, 0 DynamoDB, 0 API Gateway y 0 snapshots manuales. También está la **VPC por defecto** de la región, creada por AWS y no tocada.

**us-east-1:** los 69 recursos sin `Project=RIETI` pertenecen a **dos proyectos ajenos**, identificados por el prefijo de su nombre (no se publica). Por tipo: funciones Lambda, tablas DynamoDB, pools de Cognito, buckets S3, una API de API Gateway, una API de AppSync, una distribución de CloudFront, tópicos SNS, una regla de EventBridge, *log groups*, alarmas, una llave KMS y un instrumento de pago de la cuenta. No se inspeccionaron más allá del nombre y el tipo. Los 4 con `Project=RIETI` en esa región son recursos globales de RIETI (WAF, roles IAM).

**S3 (global):** 7 buckets en la cuenta: 3 de RIETI (los tres en `mx-central-1`) y 4 ajenos.

## 3. CloudTrail: escrituras por identidad

Ventana disponible: 12-ago-2026 a 9-oct-2026. Toda la infraestructura de RIETI se creó el **9-oct-2026** (los eventos `CreateVpc`, `CreateDBInstance`, `CreateBucket`, etc. de RIETI son de ese día).

| Identidad | Periodo | Escrituras | ¿Alguna fuera de RIETI? |
|---|---|---|---|
| Llave del perfil `rieti` (creada el 9-oct) | 9-oct | 148 (132 en mx-central-1, 16 en us-east-1) | **No.** Las 132 regionales son sobre recursos `rieti-*`, la VPC, los SG o el pool de Cognito de RIETI. Las 16 globales: 4 roles IAM `rieti-prod-*` y sus políticas, la distribución y el *VPC origin* de CloudFront, el WAF y el presupuesto de RIETI. |
| Rol de CI `rieti-prod-github-deploy` | 9-oct | 66 | **No.** Subir imágenes a ECR `rieti-backend`, registrar la task definition `rieti-prod-api` y actualizar el servicio `rieti-prod-api`. |
| Sesiones temporales de servicios de AWS iniciadas por el despliegue de RIETI | 9-oct | 19 | Solo los 5 *service-linked roles* (conclusión 3). El resto son concesiones de KMS y el secreto de RDS para `rieti-prod-db`. |
| Otras llaves del mismo usuario IAM | 12-ago a 9-oct | — | Sus escrituras apuntan a los proyectos ajenos de `us-east-1`. Son anteriores a que existiera RIETI o corresponden a la gestión de llaves del usuario (crear, desactivar y borrar llaves el 9-oct), así que se atribuyen a la persona dueña de la cuenta. |

Escrituras fallidas de RIETI (11): todas sobre recursos de RIETI (reintentos de Terraform, límites de tasa de la API de EC2, permisos ya inexistentes en SG nuevos y un `UpdateService` con parámetro inválido). Ninguna sobre recursos ajenos.

> **Limitación de atribución:** como RIETI usa una llave del **mismo usuario IAM** que la persona dueña, CloudTrail no distingue a las personas por usuario. La separación se hizo por **llave de acceso** y por **recurso afectado**.

## 4. Permisos de la identidad que usa RIETI

| Pregunta | Respuesta |
|---|---|
| ¿Existe un usuario IAM `rieti`? | **No.** La cuenta tiene un solo usuario IAM. |
| ¿De quién es la llave del perfil `rieti`? | Del usuario de la persona dueña de la cuenta. Se creó el 9-oct-2026 y es una de sus 2 llaves activas. |
| Políticas | `AdministratorAccess` e `IAMUserChangePassword` (administradas por AWS), sin políticas en línea ni grupos. |
| *Permissions boundary* | Ninguno. |
| ¿Puede actuar sobre recursos ajenos? | **Sí, sobre todos.** Nada técnico lo impide; el aislamiento depende solo de la disciplina de uso. |
| Rol de CI `rieti-prod-github-deploy` | Acotado: solo se puede asumir desde la rama `main` de este repositorio (sujeto OIDC inmutable). Puede subir imágenes solo a `rieti-backend`, actualizar solo el servicio `rieti-prod-api` y pasar solo los 2 roles de ECS de RIETI. Excepción: `ecs:RegisterTaskDefinition` y `DescribeTaskDefinition` sobre `*`, porque AWS no permite restringirlos por recurso. Con eso puede registrar revisiones de cualquier familia, pero no puede hacer que otro servicio las use. |
| Roles de ejecución de ECS | Acotados al secreto de RDS, al bucket de evidencias y a la CMK de RIETI. |

## 5. Referencias en el código

| Archivo | Resultado |
|---|---|
| `.github/workflows/backend.yml` | Solo usa variables de GitHub (`AWS_DEPLOY_ROLE_ARN`, `ECR_REPOSITORY`, `ECS_*`, `API_URL`) y la región `mx-central-1`. Sus valores no se leyeron, pero CloudTrail muestra que el rol asumido es `rieti-prod-github-deploy` y que solo tocó recursos de RIETI. |
| `.github/workflows/android.yml`, `seguridad.yml` | No llaman a AWS. |
| `infra/terraform/*.tf` | Todos los recursos usan el prefijo `rieti-prod` / `rieti-`. Fuentes de datos: el proveedor OIDC ajeno (solo lectura, ver sección 1), políticas administradas de CloudFront y la lista de prefijos de CloudFront (de AWS), la identidad y las zonas de disponibilidad. Sin ARNs ni nombres de recursos ajenos. Las condiciones `aws:SourceAccount` usan la cuenta actual. |
| `infra/bootstrap.sh` | Solo crea y configura el bucket `rieti-tfstate-<cuenta>-mx`. |

## Recomendaciones

Ordenadas por urgencia. **Ninguna se ejecutó** (esta tarea fue de solo lectura); las que modifican IAM las debe decidir la persona dueña de la cuenta.

1. **Desactivar y borrar la llave del perfil `rieti`** (creada el 9-oct-2026). Es una llave de administrador de toda la cuenta y se compartió por un canal no seguro. Coincide con el pendiente D-10.
2. **Dar a RIETI una identidad propia y acotada:** un usuario o rol `rieti` cuya política solo permita actuar sobre recursos con `aws:ResourceTag/Project=RIETI` (y `aws:RequestTag` al crear), en `mx-central-1` más los servicios globales necesarios, con un *permissions boundary* que impida escalar privilegios. Mejor aún: mover RIETI a una cuenta propia dentro de una organización de AWS.
3. **Alinear la convención de etiquetas** con D-09: decidir entre `Project=RIETI` (lo desplegado) o `proyecto=rieti` (lo documentado) y actualizar el documento o Terraform.
4. **Avisar a la persona dueña** que RIETI depende de su proveedor OIDC de GitHub y que se crearon 5 *service-linked roles* en su cuenta.
5. **Activar un *trail* de CloudTrail propio** (o consultar el de la organización) para conservar los eventos más de 90 días e incluir eventos de datos de los buckets de RIETI.
