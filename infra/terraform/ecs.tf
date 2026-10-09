# ECR + ECS Fargate (ARM64/Graviton) para el API NestJS.

resource "aws_ecr_repository" "api" {
  name                 = "${var.proyecto}-backend"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.principal.arn
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Conservar las ultimas 15 imagenes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 15 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.nombre}-api"
  retention_in_days = var.retencion_logs_dias
  kms_key_id        = aws_kms_key.principal.arn
}

resource "aws_ecs_cluster" "principal" {
  name = "${local.nombre}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "principal" {
  cluster_name       = aws_ecs_cluster.principal.name
  capacity_providers = ["FARGATE"]
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# --- IAM ---

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.actual.account_id]
    }
  }
}

# Rol de ejecución: ECS lo usa para bajar la imagen, escribir logs e inyectar secretos.
resource "aws_iam_role" "ejecucion" {
  name               = "${local.nombre}-ecs-ejecucion"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "ejecucion" {
  role       = aws_iam_role.ejecucion.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ejecucion_secretos" {
  role = aws_iam_role.ejecucion.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = aws_db_instance.principal.master_user_secret[0].secret_arn },
      { Effect = "Allow", Action = "kms:Decrypt", Resource = aws_kms_key.principal.arn },
    ]
  })
}

# Rol de la tarea: permisos del código del API en tiempo de ejecución.
resource "aws_iam_role" "tarea" {
  name               = "${local.nombre}-ecs-tarea"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy" "tarea" {
  role = aws_iam_role.tarea.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "LeerSecretoBD", Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = aws_db_instance.principal.master_user_secret[0].secret_arn },
      { Sid = "Evidencias", Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject"], Resource = "${aws_s3_bucket.evidencias.arn}/*" },
      { Sid = "Kms", Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.principal.arn },
    ]
  })
}

# --- Task definition y servicio ---

locals {
  contenedor = "api"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.nombre}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memoria
  execution_role_arn       = aws_iam_role.ejecucion.arn
  task_role_arn            = aws_iam_role.tarea.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name                   = local.contenedor
    image                  = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
    essential              = true
    readonlyRootFilesystem = true
    portMappings           = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "PORT", value = "3000" },
      { name = "DB_HOST", value = aws_db_instance.principal.address },
      { name = "DB_PORT", value = tostring(aws_db_instance.principal.port) },
      { name = "DB_NAME", value = aws_db_instance.principal.db_name },
      { name = "DB_SECRET_ARN", value = aws_db_instance.principal.master_user_secret[0].secret_arn },
      { name = "COGNITO_USER_POOL_ID", value = aws_cognito_user_pool.personal.id },
      { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.api.id },
      { name = "AWS_REGION", value = var.region },
      { name = "EVIDENCIAS_BUCKET", value = aws_s3_bucket.evidencias.bucket },
      { name = "TRUST_PROXY_HOPS", value = "2" },
    ]
    secrets = [
      { name = "DB_USERNAME", valueFrom = "${aws_db_instance.principal.master_user_secret[0].secret_arn}:username::" },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "api"
        mode                  = "non-blocking"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name                              = "${local.nombre}-api"
  cluster                           = aws_ecs_cluster.principal.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.api_tareas_min
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 90
  propagate_tags                    = "SERVICE"
  enable_execute_command            = false

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.privada[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = local.contenedor
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]

  lifecycle {
    # GitHub Actions registra nuevas revisiones; el autoscaling ajusta el número de tareas.
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.principal.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_tareas_min
  max_capacity       = var.api_tareas_max
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.nombre}-api-cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
