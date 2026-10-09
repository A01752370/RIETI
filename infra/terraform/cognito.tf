# Identidad del personal SIPINNA (RNF-18). Los ciudadanos reportan de forma anónima.

resource "aws_cognito_user_pool" "personal" {
  name                     = "${local.nombre}-personal"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = "ACTIVE"
  mfa_configuration        = "OPTIONAL"

  software_token_mfa_configuration { enabled = true }

  # Solo un administrador da de alta cuentas.
  admin_create_user_config { allow_admin_create_user_only = true }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 3
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  username_configuration { case_sensitive = false }
}

resource "aws_cognito_user_group" "grupos" {
  for_each     = { Administrador = "Administración de RIETI", PersonalSIPINNA = "Personal operativo SIPINNA" }
  user_pool_id = aws_cognito_user_pool.personal.id
  name         = each.key
  description  = each.value
}

# Cliente público (sin secret) usado por el API para USER_PASSWORD_AUTH.
resource "aws_cognito_user_pool_client" "api" {
  name                                 = "${local.nombre}-api"
  user_pool_id                         = aws_cognito_user_pool.personal.id
  generate_secret                      = false
  explicit_auth_flows                  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 12
  allowed_oauth_flows_user_pool_client = false

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "hours"
  }
}
