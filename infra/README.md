# RIETI — Infraestructura (Terraform)

Arquitectura de la Etapa 2 en **mx-central-1**:

```
App Android ──HTTPS──► CloudFront (+ WAF) ──VPC origin──► ALB interno ──► ECS Fargate (NestJS, ARM64)
                                                                              │
                         Cognito (JWT) ◄──────────────────────────────────────┤
                         RDS PostgreSQL 16 + PostGIS (subred de datos) ◄──────┤
                         Secrets Manager (contraseña de BD, rotada) ◄─────────┤
                         S3 evidencias (KMS) ◄────────────────────────────────┘
```

| Capa | Recursos | Notas de seguridad |
|---|---|---|
| Red | VPC 10.0.0.0/16, 2 AZ, subredes pública/privada/datos, 1 NAT, endpoint S3, Flow Logs | Datos sin ruta a internet; SG por defecto sin reglas |
| Borde | CloudFront (HTTPS, HTTP/3, headers de seguridad), WAF (rate limit + reglas administradas) | El ALB no tiene IP pública; solo CloudFront lo alcanza |
| Cómputo | ECR (inmutable, escaneo), ECS Fargate, autoscaling 1–3 por CPU | Rootfs de solo lectura, sin `exec`, circuit breaker con rollback |
| Datos | RDS `db.t4g.micro`, gp3 cifrado con CMK, backups (1 día por el plan gratuito; `db_backup_dias`), `force_ssl`, pgAudit | Protección contra borrado, snapshot final |
| Identidad | Cognito (solo alta por admin, MFA TOTP opcional, contraseñas ≥12), grupos `Administrador` / `PersonalSIPINNA` | |
| CI/CD | Rol IAM para GitHub Actions por OIDC, limitado a `main` del repo | Sin access keys en GitHub |
| Operación | CloudWatch Logs (30 días, KMS), 5 alarmas, presupuesto mensual → SNS | |

## Uso

```bash
export AWS_PROFILE=rieti
./bootstrap.sh            # una sola vez: bucket de estado remoto
cd terraform
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

Variables útiles (`terraform.tfvars`, no se versiona): `alerta_emails`, `db_multi_az`, `presupuesto_mensual_usd`, `habilitar_waf`.

## Pendientes conocidos

- **Dominio propio**: con un dominio en Route 53 se agrega un certificado ACM (us-east-1) y un alias en CloudFront.
- **Alta disponibilidad**: un solo NAT, RDS Single-AZ y 1 tarea mínima, para controlar el costo de un proyecto académico.
- **Usuario de BD de mínimo privilegio**: la API usa el usuario maestro; conviene crear un rol `rieti_app` sin DDL.
- **Evidencias**: el bucket y los permisos existen; falta el endpoint de carga (EXIF + SHA-256).
