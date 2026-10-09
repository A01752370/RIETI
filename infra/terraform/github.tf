# Despliegue continuo desde GitHub Actions vía OIDC: sin access keys guardadas en GitHub.

# El proveedor OIDC ya existe en la cuenta (lo gestiona otro proyecto); solo se referencia.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_deploy" {
  name = "${local.nombre}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          # Solo la rama de despliegue de este repositorio (sujeto inmutable: owner@id/repo@id).
          "token.actions.githubusercontent.com:sub" = "${var.github_oidc_sub_prefijo}:ref:refs/heads/${var.github_rama_despliegue}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrLogin", Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart", "ecr:DescribeImages",
        ]
        Resource = aws_ecr_repository.api.arn
      },
      { Sid = "KmsEcr", Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = aws_kms_key.principal.arn },
      # Register/DescribeTaskDefinition no admiten restricción por recurso.
      { Sid = "TaskDefinitions", Effect = "Allow", Action = ["ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition"], Resource = "*" },
      { Sid = "Servicio", Effect = "Allow", Action = ["ecs:UpdateService", "ecs:DescribeServices"], Resource = aws_ecs_service.api.id },
      {
        Sid       = "PasarRoles"
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = [aws_iam_role.ejecucion.arn, aws_iam_role.tarea.arn]
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
    ]
  })
}
