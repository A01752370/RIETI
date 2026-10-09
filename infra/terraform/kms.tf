# Llave KMS administrada por el cliente para RDS, su secreto, S3, logs y SNS.

data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "AdministracionCuenta"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.actual.account_id}:root"]
    }
  }

  statement {
    sid       = "CloudWatchLogs"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${var.region}:${data.aws_caller_identity.actual.account_id}:log-group:*"]
    }
  }

  statement {
    sid       = "AlarmasYPresupuestoHaciaSNS"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "principal" {
  description             = "${local.nombre}: cifrado en reposo (RDS, S3, logs, SNS)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "principal" {
  name          = "alias/${local.nombre}"
  target_key_id = aws_kms_key.principal.key_id
}
