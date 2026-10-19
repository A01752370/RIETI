# Bucket privado de evidencias (RF-08 / RNF-22) y bucket de access logs del ALB.

resource "aws_s3_bucket" "evidencias" {
  bucket = "${local.nombre}-evidencias-${data.aws_caller_identity.actual.account_id}"
  tags   = { DataClass = "Confidencial" }
}

resource "aws_s3_bucket_ownership_controls" "evidencias" {
  bucket = aws_s3_bucket.evidencias.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_public_access_block" "evidencias" {
  bucket                  = aws_s3_bucket.evidencias.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "evidencias" {
  bucket = aws_s3_bucket.evidencias.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidencias" {
  bucket = aws_s3_bucket.evidencias.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.principal.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "evidencias" {
  bucket = aws_s3_bucket.evidencias.id
  rule {
    id     = "expirar-versiones-antiguas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }

  # Fase 8: subidas sin confirmar (zona de entrada, pueden traer EXIF) se borran al día siguiente,
  # también sus versiones anteriores (S3 aplica la expiración más corta cuando las reglas se traslapan).
  rule {
    id     = "expirar-entrantes"
    status = "Enabled"
    filter { prefix = "entrantes/" }
    expiration { days = 1 }
    noncurrent_version_expiration { noncurrent_days = 1 }
  }

  # Fase 8 (D-42): conservación provisional de las fotos, 365 días, hasta que el socio defina la política.
  rule {
    id     = "expirar-fotos"
    status = "Enabled"
    filter { prefix = "fotos/" }
    expiration { days = 365 }
  }
}

# Fase 8: la web sube la foto directo a S3 con un POST prefirmado; solo desde su propio origen.
resource "aws_s3_bucket_cors_configuration" "evidencias" {
  bucket = aws_s3_bucket.evidencias.id
  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = ["https://${aws_cloudfront_distribution.api.domain_name}"]
    allowed_headers = ["*"]
    max_age_seconds = 300
  }
}

data "aws_iam_policy_document" "evidencias" {
  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.evidencias.arn, "${aws_s3_bucket.evidencias.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "evidencias" {
  bucket     = aws_s3_bucket.evidencias.id
  policy     = data.aws_iam_policy_document.evidencias.json
  depends_on = [aws_s3_bucket_public_access_block.evidencias]
}

# --- Logs de acceso del ALB (ELB no admite CMK: se usa SSE-S3) ---

resource "aws_s3_bucket" "alb_logs" {
  bucket        = "${local.nombre}-alb-logs-${data.aws_caller_identity.actual.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    id     = "expirar"
    status = "Enabled"
    filter {}
    expiration { days = 90 }
  }
}

data "aws_iam_policy_document" "alb_logs" {
  statement {
    sid       = "EntregaLogsELB"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.alb_logs.arn}/alb/AWSLogs/${data.aws_caller_identity.actual.account_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["logdelivery.elasticloadbalancing.amazonaws.com"]
    }
  }
  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.alb_logs.arn, "${aws_s3_bucket.alb_logs.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket     = aws_s3_bucket.alb_logs.id
  policy     = data.aws_iam_policy_document.alb_logs.json
  depends_on = [aws_s3_bucket_public_access_block.alb_logs]
}
