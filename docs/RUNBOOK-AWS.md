# Runbook AWS — entrega del 10-oct-2026

**Para quién:** la persona que administra la cuenta de AWS de RIETI (perfil `rieti`, región `mx-central-1`).
**Objetivo:** dejar en producción el código de la rama `integracion-final`, limpio y con un usuario de personal listo para la demo.
**Tiempo estimado:** 45–60 minutos (la mayor parte es esperar al despliegue).

> Cada paso dice qué hace, el comando exacto y cómo verificar. Hazlos **en orden**. Si un paso falla, detente y revisa la sección [Si algo sale mal](#si-algo-sale-mal) antes de seguir.
>
> Los pasos 1 a 5 **modifican recursos de AWS**. Ninguno se ha ejecutado todavía; el 10-oct-2026 solo se corrieron consultas de lectura (incluido un `terraform plan`, que no mostró diferencias).

## Paso 0 — Preparar la terminal

Funciona en Git Bash (Windows), macOS, Linux o WSL.

```bash
export AWS_PROFILE=rieti
export AWS_REGION=mx-central-1
export API=https://d3hexe1fo0mq6l.cloudfront.net
export CLUSTER=rieti-prod-cluster
export SERVICIO=rieti-prod-api
export POOL=$(aws cognito-idp list-user-pools --max-results 20 \
  --query "UserPools[?Name=='rieti-prod-personal'].Id | [0]" --output text)

aws sts get-caller-identity --query Arn --output text   # debe mostrar tu usuario de la cuenta del proyecto
echo "Pool: $POOL"                                        # debe empezar con mx-central-1_
```

## Paso 1 — Snapshot manual de la base de datos (antes de desplegar)

**Por qué:** el despliegue aplica una migración que cambia el catálogo de estatus y agrega columnas, y los respaldos automáticos solo guardan 1 día (D-02). El snapshot permite volver atrás.

```bash
export SNAP=rieti-prod-antes-entrega-$(date +%Y%m%d-%H%M)
aws rds create-db-snapshot --db-instance-identifier rieti-prod-db --db-snapshot-identifier "$SNAP"
aws rds wait db-snapshot-available --db-snapshot-identifier "$SNAP"   # tarda unos minutos
aws rds describe-db-snapshots --db-snapshot-identifier "$SNAP" --query 'DBSnapshots[0].Status' --output text
```

**Verificar:** la última línea imprime `available`.

## Paso 2 — Fusionar el PR (esto despliega)

**Por qué:** el workflow `Backend` despliega automáticamente a ECS en cada push a `main` que toque `backend/`. **Fusionar el PR equivale a aprobar el despliegue.** La tarea nueva aplica la migración `1760100000000-ClaveConsultaYEstatus` al arrancar.

1. Abre el PR `integracion-final → main` en GitHub.
2. Revisa que los checks estén en verde: **Backend / test**, **Backend / e2e (maestro)**, **Backend / e2e (rieti_app)**, **Android / build** y **Seguridad / gitleaks**.
3. Fusiona el PR (botón **Merge pull request**).
4. Ve a **Actions → Backend** y espera a que el job **deploy** termine en verde (≈10 minutos; incluye esperar a que el servicio quede estable y un `curl` a `/health`).

**Verificar** (desde la terminal del paso 0):

```bash
curl -s "$API/health"; echo                                                  # {"estado":"ok"}
curl -s "$API/api/v1/catalogos"; echo                                        # ..."estatus":["Recibido","En revisión","En atención","Canalizado","Concluido","Descartado"]
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/v1/reportes"              # 401 (la bandeja exige sesión)
curl -s -o /dev/null -w "%{http_code}\n" "$API/reportes/folio/RIETI-2026-000001"   # 404 (ruta vieja retirada)
```

Si los cuatro resultados coinciden, el backend nuevo está en producción.

## Paso 3 — Borrar el reporte de prueba `RIETI-2026-000001`

**Por qué:** es un reporte de prueba del despliegue inicial y no debe aparecer en la demo. La bitácora es solo de inserción, así que no se puede borrar con un `DELETE` normal; el script `backend/src/scripts/borrar-reporte.ts` desactiva y reactiva el trigger dentro de una sola transacción. Se ejecuta como **tarea única de ECS** con la misma imagen y red del API (no hace falta abrir la base de datos a internet).

> Debe hacerse **después** del paso 2: el script viene en la imagen nueva.

```bash
TD=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICIO" \
  --query 'services[0].taskDefinition' --output text)
SUBNETS=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICIO" \
  --query 'services[0].networkConfiguration.awsvpcConfiguration.subnets' --output text | tr '\t' ',')
SG=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICIO" \
  --query 'services[0].networkConfiguration.awsvpcConfiguration.securityGroups' --output text | tr '\t' ',')
echo "$TD"   # debe ser la revisión recién desplegada por el paso 2

TAREA=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$TD" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/scripts/borrar-reporte.js","RIETI-2026-000001","--confirmar"]}]}' \
  --query 'tasks[0].taskArn' --output text)
echo "$TAREA"

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TAREA"
aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TAREA" --query 'tasks[0].containers[0].exitCode' --output text
aws logs tail /ecs/rieti-prod-api --since 15m --filter-pattern '"Borrado"'
```

**Verificar:** el código de salida es `0` y el log dice `Borrado RIETI-2026-000001: 1 caso(s), N evento(s) de bitácora.`

- Si dice `No existe el folio RIETI-2026-000001`, ya estaba borrado: no hay nada que hacer.
- Cualquier otro error deja la base sin cambios (todo corre en una transacción).

## Paso 4 — Crear el usuario de personal para la demo

**Por qué:** hoy el pool no tiene usuarios. La app todavía no soporta el cambio de contraseña inicial ni el reto MFA, así que la cuenta se crea con **contraseña permanente** y **sin configurar MFA**.

```bash
export CORREO=correo.de.la.persona@dominio.mx     # el correo real de quien va a probar

aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$CORREO" \
  --user-attributes Name=email,Value="$CORREO" Name=email_verified,Value=true \
  --message-action SUPPRESS

# La contraseña se escribe sin que aparezca en pantalla ni en el historial.
# Requisitos: 12+ caracteres, mayúscula, minúscula, número y símbolo.
read -rs -p "Contraseña: " PASS; echo
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username "$CORREO" --password "$PASS" --permanent
unset PASS

aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "$CORREO" --group-name PersonalSIPINNA
```

Si la persona también será administradora, agrega además `--group-name Administrador` con el mismo comando.

### Perfiles y municipios del personal (Fase 7, D-36)

| Perfil | Grupo de Cognito | Qué ve |
|---|---|---|
| Enlace municipal | `PersonalSIPINNA` | Solo los municipios que tenga asignados en RIETI |
| Coordinador regional | `CoordinadorRegional` | Todos los municipios; no administra personal ni parámetros |
| Administrador | `Administrador` | Todos los municipios y la administración |

```bash
# Coordinador regional (en lugar de PersonalSIPINNA):
aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "$CORREO" --group-name CoordinadorRegional
# Cambiar de perfil: quitar el grupo anterior.
aws cognito-idp admin-remove-user-from-group --user-pool-id "$POOL" --username "$CORREO" --group-name PersonalSIPINNA
```

El perfil se sincroniza en el siguiente inicio de sesión (el access token vigente conserva los grupos anteriores hasta 60 min).

**Asignar municipios a un enlace municipal:** después de su primer inicio de sesión, un Administrador entra a la web del personal → **Administración → Personal y municipios → Asignar municipios**, elige los municipios y guarda. Un enlace **sin municipios no ve ningún reporte** (negación por defecto). Los enlaces que ya existían antes de la Fase 7 quedaron asignados a su municipio registrado o, si no tenían, a Atizapán de Zaragoza. Cada cambio de asignación aplica en la siguiente petición.

**Fila en la tabla `usuario`:** no hay que crearla a mano. El API la crea (o la actualiza) automáticamente en el primer inicio de sesión, con el `cognito_sub`, el correo y el rol.

**Verificar:**

```bash
aws cognito-idp admin-get-user --user-pool-id "$POOL" --username "$CORREO" --query UserStatus --output text   # CONFIRMED
aws cognito-idp admin-list-groups-for-user --user-pool-id "$POOL" --username "$CORREO" --query 'Groups[].GroupName' --output text   # PersonalSIPINNA
```

Entrega la contraseña a la persona por un canal privado (en persona o con un gestor de contraseñas), **no** por el chat del equipo.

## Paso 5 — Correos de alertas (`alerta_emails`)

**Por qué:** las 5 alarmas y el presupuesto mensual publican en un tópico SNS que hoy no tiene suscriptores, así que nadie se entera de una caída o de un gasto alto. Destinatarios recomendados (D-05): responsable de la cuenta AWS, Bowser y quien lleve el backend.

```bash
cd infra/terraform
cat > terraform.tfvars <<'EOF'
alerta_emails = ["responsable@dominio.mx", "otra.persona@dominio.mx"]
EOF
# terraform.tfvars está en .gitignore: no se sube al repositorio.

terraform init -backend-config=backend.hcl   # backend.hcl lo genera infra/bootstrap.sh; no está en git
terraform plan -out tfplan
```

**Antes de aplicar, revisa el plan.** Solo debe mostrar recursos `aws_sns_topic_subscription.email[...]` por crear (`Plan: N to add, 0 to change, 0 to destroy`, con N = número de correos). El 10-oct-2026 el plan sin `tfvars` no mostró diferencias, así que cualquier otro cambio es inesperado: **no apliques** y avisa al equipo.

```bash
terraform apply tfplan
rm tfplan
```

Cada destinatario recibe un correo **"AWS Notification - Subscription Confirmation"** y debe abrir el enlace **Confirm subscription**. Hasta entonces no recibe alertas.

**Verificar:**

```bash
TOPICO=$(aws sns list-topics --query "Topics[?ends_with(TopicArn, ':rieti-prod-alarmas')].TopicArn | [0]" --output text)
aws sns list-subscriptions-by-topic --topic-arn "$TOPICO" --query 'Subscriptions[].[Endpoint,SubscriptionArn]' --output table
```

Cada correo confirmado muestra un ARN; los pendientes muestran `PendingConfirmation`.

## Paso 6 — Verificación final

| Revisión | Cómo | Esperado |
|---|---|---|
| API nuevo en producción | Paso 2, verificación | 4 resultados correctos |
| Sin reporte de prueba | Iniciar sesión en la app y abrir la bandeja | La bandeja no muestra `RIETI-2026-000001` |
| Usuario de personal | Paso 4, verificación | `CONFIRMED` y grupo `PersonalSIPINNA` |
| Alertas | Paso 5, verificación | Todos los correos confirmados |
| Servicio sano | `aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICIO" --query 'services[0].[runningCount,desiredCount]' --output text` | `1 1` (o más si autoescaló) |
| Flujo de punta a punta | [PRUEBA-APP](PRUEBA-APP.md) | Todos los pasos en verde |

## Después de la demo

1. **Borrar el snapshot** del paso 1 si ya no se necesita: `aws rds delete-db-snapshot --db-snapshot-identifier "$SNAP"`.
2. **Rotar credenciales** (D-10): llave del perfil `rieti` y token de GitHub usados durante el desarrollo.
3. **Datos de prueba:** los reportes creados durante las pruebas se pueden quitar con el mismo procedimiento del paso 3, cambiando el folio.
4. **Pausar costos** si el proyecto no continúa: escalar el servicio a 0 tareas y detener RDS, o `terraform destroy` (decisión del equipo; RDS tiene protección contra borrado).

## Opcional (no requerido para la entrega) — Usuario de BD `rieti_app` (D-08)

El script `infra/sql/01-rol-rieti-app.sql` crea un rol sin permisos de DDL, sin `DELETE` y sin acceso para alterar la bitácora. Está probado en local: las 36 pruebas e2e pasan con el API conectado con ese rol. Activarlo en AWS requiere trabajo de infraestructura que **no** está preparado en Terraform:

1. Ejecutar el SQL como usuario maestro (por ejemplo, con una tarea única de ECS como en el paso 3).
2. Darle inicio de sesión a `rieti_app` (contraseña en un secreto nuevo de Secrets Manager, o autenticación IAM de RDS).
3. Cambiar la task definition: `DB_USERNAME=rieti_app`, su secreto y `DB_MIGRAR_AL_INICIAR=false`.
4. Correr las migraciones futuras como tarea única con el usuario maestro.

Se recomienda hacerlo después de la presentación, con calma.

## Limpieza de datos de prueba (Fase 9, D-47)

**Convención:** todo reporte ficticio lleva `[PRUEBA]` al inicio de la descripción. Los anteriores a esta convención se borran por folio.

El script `backend/src/scripts/limpiar-pruebas.ts` borra, en una sola transacción, los reportes indicados con su bitácora, accesos, casos, folios, menores y ubicaciones; retira los vínculos de duplicado de otros reportes hacia ellos (y lo anota en su bitácora); elimina las alertas de punto recurrente que ya no reúnen el mínimo; y al final borra de S3 las fotos con todas sus versiones. Es idempotente: los folios que ya no existen se informan y se omiten.

Corre como tarea única de ECS (variables del paso 3) con el **rol de limpieza**, el único que puede borrar fotos (el API no puede):

```bash
ROL=$(terraform -chdir=infra/terraform output -raw rol_limpieza_arn)
correr() {   # $1 = argumentos del script en JSON, p. ej. '"--marca","--dry-run"'
  TAREA=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$TD"     --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}"     --overrides "{\"taskRoleArn\":\"$ROL\",\"containerOverrides\":[{\"name\":\"api\",\"command\":[\"node\",\"dist/scripts/limpiar-pruebas.js\",$1]}]}"     --query 'tasks[0].taskArn' --output text)
  aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TAREA"
  aws logs tail /ecs/rieti-prod-api --since 10m --filter-pattern '"LIMPIEZA" OR "SIMULACIÓN" OR "RIETI-" OR "Error"'
}

# 1. Siempre primero la simulación (no cambia nada):
correr '"--folios","RIETI-2026-000001,RIETI-ATZ-2026-000019","--dry-run"'
correr '"--marca","--dry-run"'
# 2. Si la lista es la correcta, la misma orden con --confirmar en lugar de --dry-run.
```

**Verificar:** la salida lista cada folio con su municipio, fecha y conteos (bitácora, accesos, fotos), los vínculos retirados, las alertas eliminadas y las versiones borradas en S3. Repetir la orden debe decir que los folios no existen.

## Conservación de la bitácora de accesos (Fase 7, D-40)

La tabla `acceso_expediente` registra quién consultó o exportó expedientes y es solo de inserción. Conservación por omisión: **365 días** (parámetro `accesos_conservacion_dias`, editable por el Administrador entre 90 y 3650 días en **Administración → Parámetros**). Para aplicarla, corre esta tarea única con las variables del paso 3 (por ejemplo, una vez al mes):

```bash
TAREA=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$TD"   --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}"   --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/scripts/depurar-accesos.js","--confirmar"]}]}'   --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TAREA"
aws logs tail /ecs/rieti-prod-api --since 15m --filter-pattern '"Bitácora de accesos depurada"'
```

El script desactiva y reactiva el trigger dentro de una sola transacción (como `borrar-reporte`). La política definitiva la debe fijar el socio formador.

## Opcional — Catálogo de códigos postales de SEPOMEX (Fase 2)

**Antes de hacerlo:** el catálogo de Correos de México se ofrece "para uso particular", sin permitir su distribución. Confirmen con el área jurídica del SIPINNA que validar reportes con él es compatible con esos términos. Mientras la tabla `codigo_postal_municipio` esté vacía, el API solo valida que el CP sea del Estado de México (50000–57999).

El script descarga el archivo oficial dentro de la tarea (no queda en el repositorio ni en la imagen). Usa las mismas variables del paso 3:

```bash
TAREA=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$TD"   --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}"   --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/scripts/cargar-codigos-postales.js","--descargar","--confirmar"]}]}'   --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TAREA"
aws logs tail /ecs/rieti-prod-api --since 15m --filter-pattern '"Códigos postales"'
```

**Verificar:** el log dice `Códigos postales del Estado de México cargados: N pares leídos; N en la tabla.` (unos 2,400). Para revertir: `DELETE FROM codigo_postal_municipio;` con el usuario maestro.

## Si algo sale mal

| Síntoma | Qué hacer |
|---|---|
| Un check del PR falla | No fusiones. Revisa el log del job en GitHub Actions. |
| El job `deploy` falla o el servicio no queda estable | ECS regresa solo a la versión anterior (circuit breaker con rollback). Revisa los logs: `aws logs tail /ecs/rieti-prod-api --since 30m`. La migración pudo haberse aplicado; la versión anterior sigue funcionando para crear y listar reportes. Si hace falta volver al estado previo de la BD, restaura el snapshot del paso 1 en una instancia nueva y coordínalo con el equipo. |
| `/api/v1/catalogos` da 404 después del paso 2 | El despliegue no terminó o no corrió. Revisa **Actions → Backend → deploy**. |
| La tarea del paso 3 termina con código distinto de 0 | Lee el log (`aws logs tail /ecs/rieti-prod-api --since 15m`). La base no cambió. |
| `admin-set-user-password` rechaza la contraseña | No cumple la política: 12+ caracteres, mayúscula, minúscula, número y símbolo. |
| `terraform plan` muestra cambios además de las suscripciones | No apliques. Alguien cambió algo fuera de Terraform o el código cambió; avisa al equipo. |
