# CloudFront: punto único de entrada HTTPS (certificado *.cloudfront.net mientras no haya dominio) + WAF.

resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = "${local.nombre}-alb"
    arn                    = aws_lb.api.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"
    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

# Políticas administradas por AWS.
data "aws_cloudfront_cache_policy" "sin_cache" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "todo_menos_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "seguridad" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  comment         = "${local.nombre} API"
  price_class     = "PriceClass_100" # Norteamérica (incluye México) y Europa
  http_version    = "http2and3"
  is_ipv6_enabled = true
  web_acl_id      = var.habilitar_waf ? aws_wafv2_web_acl.api[0].arn : null

  origin {
    origin_id   = "alb-api"
    domain_name = aws_lb.api.dns_name
    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.alb.id
    }
  }

  default_cache_behavior {
    target_origin_id           = "alb-api"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.sin_cache.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.todo_menos_host.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.seguridad.id
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# --- WAF (scope CLOUDFRONT, obligatoriamente en us-east-1) ---

resource "aws_wafv2_web_acl" "api" {
  count    = var.habilitar_waf ? 1 : 0
  provider = aws.us_east_1
  name     = "${local.nombre}-api"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "limite-por-ip"
    priority = 0
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 300 # peticiones por IP cada 5 min
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "limite-por-ip"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = {
      AWSManagedRulesAmazonIpReputationList = 1
      AWSManagedRulesCommonRuleSet          = 2
      AWSManagedRulesKnownBadInputsRuleSet  = 3
      AWSManagedRulesSQLiRuleSet            = 4
    }
    content {
      name     = rule.key
      priority = rule.value
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.nombre}-api"
    sampled_requests_enabled   = true
  }
}
