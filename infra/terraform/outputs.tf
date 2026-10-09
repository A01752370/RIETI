output "api_url" {
  description = "URL HTTPS pública del API (usar como URL_BASE en la app)."
  value       = "https://${aws_cloudfront_distribution.api.domain_name}/"
}

output "ecr_repositorio" {
  value = aws_ecr_repository.api.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.principal.name
}

output "ecs_servicio" {
  value = aws_ecs_service.api.name
}

output "ecs_task_family" {
  value = aws_ecs_task_definition.api.family
}

output "ecs_contenedor" {
  value = local.contenedor
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.personal.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.api.id
}

output "rds_endpoint" {
  value = aws_db_instance.principal.address
}

output "rds_secret_arn" {
  value = aws_db_instance.principal.master_user_secret[0].secret_arn
}

output "evidencias_bucket" {
  value = aws_s3_bucket.evidencias.bucket
}
