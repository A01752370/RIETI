# Cuentas OPCIONALES de ciudadano (Fase 4, D-19). Pool separado del personal:
# un token de ciudadano nunca puede abrir rutas del personal ni al revés.
# El reporte anónimo sigue siendo el valor por defecto.

resource "aws_cognito_user_pool" "ciudadanos" {
  name                     = "${local.nombre}-ciudadanos"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = "ACTIVE"
  mfa_configuration        = "OFF"

  # Auto-registro permitido (la cuenta es opcional y la crea la propia persona).
  admin_create_user_config { allow_admin_create_user_only = false }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 1
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  username_configuration { case_sensitive = false }

  # Sin atributos extra: solo el correo (minimización). Envío con el correo de Cognito
  # (límite bajo diario; para volumen real se requiere SES, ver docs/arquitectura/aws.md).
  email_configuration { email_sending_account = "COGNITO_DEFAULT" }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "RIETI: tu código de verificación"
    email_message        = "Tu código para activar tu cuenta de RIETI es {####}. Si no creaste una cuenta, ignora este mensaje."
  }

  lifecycle {
    # Cognito no permite cambiar el esquema de atributos después de crear el pool.
    ignore_changes = [schema]
  }
}

# Cliente público (sin secret) usado por el API para registro, inicio de sesión y recuperación.
resource "aws_cognito_user_pool_client" "ciudadanos_api" {
  name                                 = "${local.nombre}-ciudadanos-api"
  user_pool_id                         = aws_cognito_user_pool.ciudadanos.id
  generate_secret                      = false
  explicit_auth_flows                  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 30
  allowed_oauth_flows_user_pool_client = false
  read_attributes                      = ["email", "email_verified"]
  write_attributes                     = ["email"]

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

output "cognito_ciudadanos_pool_id" {
  description = "Pool de cuentas de ciudadano (variable de GitHub COGNITO_CIUDADANOS_POOL_ID)."
  value       = aws_cognito_user_pool.ciudadanos.id
}

output "cognito_ciudadanos_client_id" {
  description = "Cliente del API para ciudadanos (variable de GitHub COGNITO_CIUDADANOS_CLIENT_ID)."
  value       = aws_cognito_user_pool_client.ciudadanos_api.id
}
