variable "proyecto" {
  type    = string
  default = "rieti"
}

variable "entorno" {
  type    = string
  default = "prod"
}

variable "region" {
  description = "Región principal. mx-central-1 por residencia de datos en México."
  type        = string
  default     = "mx-central-1"
}

variable "github_repo" {
  description = "Repositorio (owner/nombre) autorizado a desplegar vía OIDC."
  type        = string
  default     = "A01752370/RIETI"
}

variable "github_oidc_sub_prefijo" {
  description = "Prefijo del claim sub de OIDC. El repo usa sujetos inmutables; ver GET /repos/{repo}/actions/oidc/customization/sub."
  type        = string
  default     = "repo:A01752370@120143699/RIETI@1409439035"
}

variable "github_rama_despliegue" {
  type    = string
  default = "main"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "image_tag" {
  description = "Tag inicial de la imagen. Después, GitHub Actions registra nuevas revisiones de la task definition."
  type        = string
  default     = "bootstrap"
}

variable "api_cpu" {
  type    = number
  default = 256
}

variable "api_memoria" {
  type    = number
  default = 512
}

variable "api_tareas_min" {
  type    = number
  default = 1
}

variable "api_tareas_max" {
  type    = number
  default = 3
}

variable "db_version" {
  type    = string
  default = "16.13"
}

variable "db_clase" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  description = "true duplica el costo de RDS; recomendado en producción real."
  type        = bool
  default     = false
}

variable "db_backup_dias" {
  description = "Retención de backups automáticos. El plan gratuito de AWS solo permite 1; con plan de pago usar 7 o más."
  type        = number
  default     = 1
}

variable "habilitar_waf" {
  type    = bool
  default = true
}

variable "alerta_emails" {
  description = "Correos suscritos a alarmas y presupuesto (deben confirmar la suscripción)."
  type        = list(string)
  default     = []
}

variable "presupuesto_mensual_usd" {
  type    = number
  default = 150
}

variable "retencion_logs_dias" {
  type    = number
  default = 30
}
