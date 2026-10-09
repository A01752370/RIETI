# Alarmas operativas y presupuesto. Todo notifica a un tópico SNS cifrado.

resource "aws_sns_topic" "alarmas" {
  name              = "${local.nombre}-alarmas"
  kms_master_key_id = aws_kms_key.principal.id
}

data "aws_iam_policy_document" "sns_alarmas" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alarmas.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.actual.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alarmas" {
  arn    = aws_sns_topic.alarmas.arn
  policy = data.aws_iam_policy_document.sns_alarmas.json
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alerta_emails)
  topic_arn = aws_sns_topic.alarmas.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  alarmas = {
    alb-5xx = {
      namespace   = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", stat = "Sum", umbral = 5, comparacion = "GreaterThanThreshold"
      dimensiones = { LoadBalancer = aws_lb.api.arn_suffix }
    }
    alb-sin-destinos-sanos = {
      namespace   = "AWS/ApplicationELB", metric = "HealthyHostCount", stat = "Minimum", umbral = 1, comparacion = "LessThanThreshold"
      dimensiones = { LoadBalancer = aws_lb.api.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix }
    }
    api-cpu = {
      namespace   = "AWS/ECS", metric = "CPUUtilization", stat = "Average", umbral = 85, comparacion = "GreaterThanThreshold"
      dimensiones = { ClusterName = aws_ecs_cluster.principal.name, ServiceName = aws_ecs_service.api.name }
    }
    rds-cpu = {
      namespace   = "AWS/RDS", metric = "CPUUtilization", stat = "Average", umbral = 80, comparacion = "GreaterThanThreshold"
      dimensiones = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
    }
    rds-almacenamiento = {
      namespace   = "AWS/RDS", metric = "FreeStorageSpace", stat = "Minimum", umbral = 2147483648, comparacion = "LessThanThreshold"
      dimensiones = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "alarmas" {
  for_each            = local.alarmas
  alarm_name          = "${local.nombre}-${each.key}"
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  dimensions          = each.value.dimensiones
  threshold           = each.value.umbral
  comparison_operator = each.value.comparacion
  period              = 300
  evaluation_periods  = 2
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
  ok_actions          = [aws_sns_topic.alarmas.arn]
}

resource "aws_budgets_budget" "mensual" {
  name         = "${local.nombre}-mensual"
  budget_type  = "COST"
  limit_amount = tostring(var.presupuesto_mensual_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$RIETI"]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alarmas.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alarmas.arn]
  }

  depends_on = [aws_sns_topic_policy.alarmas]
}
