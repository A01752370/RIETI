# Security groups de mínimo privilegio: CloudFront → ALB → API → RDS.

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name        = "${local.nombre}-alb"
  description = "ALB interno: solo trafico desde CloudFront (VPC origin)"
  vpc_id      = aws_vpc.principal.id
  tags        = { Name = "${local.nombre}-alb" }
}

resource "aws_security_group" "api" {
  name        = "${local.nombre}-api"
  description = "Tareas ECS del API: solo desde el ALB"
  vpc_id      = aws_vpc.principal.id
  tags        = { Name = "${local.nombre}-api" }
}

resource "aws_security_group" "db" {
  name        = "${local.nombre}-db"
  description = "RDS PostgreSQL: solo desde el API"
  vpc_id      = aws_vpc.principal.id
  tags        = { Name = "${local.nombre}-db" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_desde_cloudfront" {
  security_group_id = aws_security_group.alb.id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  description       = "CloudFront origin-facing"
}

resource "aws_vpc_security_group_egress_rule" "alb_hacia_api" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_vpc_security_group_ingress_rule" "api_desde_alb" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_vpc_security_group_egress_rule" "api_hacia_db" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

# HTTPS saliente vía NAT: ECR, Secrets Manager, CloudWatch Logs, Cognito (JWKS / InitiateAuth).
resource "aws_vpc_security_group_egress_rule" "api_https" {
  security_group_id = aws_security_group.api.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "db_desde_api" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
# sg-db sin reglas de salida.
