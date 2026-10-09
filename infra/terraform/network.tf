# VPC en 2 AZ: subredes públicas (NAT), privadas de aplicación (ALB interno + ECS) y de datos (RDS).

locals {
  azs = slice(data.aws_availability_zones.disponibles.names, 0, 2)
}

resource "aws_vpc" "principal" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.nombre}-vpc" }
}

# Sin reglas: nada puede usar el SG por defecto por accidente.
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.nombre}-default-sin-uso" }
}

# Requerido también por CloudFront VPC Origins.
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.nombre}-igw" }
}

resource "aws_subnet" "publica" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  tags              = { Name = "${local.nombre}-publica-${local.azs[count.index]}", Tier = "publica" }
}

resource "aws_subnet" "privada" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 10 + count.index)
  tags              = { Name = "${local.nombre}-privada-${local.azs[count.index]}", Tier = "privada" }
}

resource "aws_subnet" "datos" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 20 + count.index)
  tags              = { Name = "${local.nombre}-datos-${local.azs[count.index]}", Tier = "datos" }
}

# Un solo NAT Gateway para contener costos (no es HA: si cae la AZ A, ECS pierde salida a internet).
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.nombre}-nat-eip" }
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.publica[0].id
  tags          = { Name = "${local.nombre}-nat" }
  depends_on    = [aws_internet_gateway.igw]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
  tags = { Name = "${local.nombre}-rt-publica" }
}

resource "aws_route_table" "privada" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
  tags = { Name = "${local.nombre}-rt-privada" }
}

# Subredes de datos sin ruta a internet.
resource "aws_route_table" "datos" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.nombre}-rt-datos" }
}

resource "aws_route_table_association" "publica" {
  count          = 2
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table_association" "privada" {
  count          = 2
  subnet_id      = aws_subnet.privada[count.index].id
  route_table_id = aws_route_table.privada.id
}

resource "aws_route_table_association" "datos" {
  count          = 2
  subnet_id      = aws_subnet.datos[count.index].id
  route_table_id = aws_route_table.datos.id
}

# Endpoint gateway de S3 (gratis): capas de ECR y evidencias no pasan por el NAT.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.privada.id]
  tags              = { Name = "${local.nombre}-vpce-s3" }
}

# VPC Flow Logs para auditoría de red.
resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/vpc/${local.nombre}/flow-logs"
  retention_in_days = var.retencion_logs_dias
  kms_key_id        = aws_kms_key.principal.arn
}

resource "aws_iam_role" "flow_logs" {
  name = "${local.nombre}-vpc-flow-logs"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.actual.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "flow_logs" {
  role = aws_iam_role.flow_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.flow_logs.arn}:*"
    }]
  })
}

resource "aws_flow_log" "vpc" {
  vpc_id          = aws_vpc.principal.id
  traffic_type    = "REJECT"
  log_destination = aws_cloudwatch_log_group.flow_logs.arn
  iam_role_arn    = aws_iam_role.flow_logs.arn
}
