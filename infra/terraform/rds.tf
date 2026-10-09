# RDS PostgreSQL 16 + PostGIS (la extensión la crea la migración inicial del backend).

resource "aws_db_subnet_group" "principal" {
  name       = "${local.nombre}-db"
  subnet_ids = aws_subnet.datos[*].id
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${local.nombre}-postgres16"
  family = "postgres16"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  # pgAudit (RNF-21): DDL, cambios de roles y escrituras. Sin parámetros para no volcar datos personales al log.
  parameter {
    name         = "shared_preload_libraries"
    value        = "pgaudit,pg_stat_statements"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "pgaudit.log"
    value = "ddl,role,write"
  }

  parameter {
    name  = "pgaudit.log_parameter"
    value = "0"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  lifecycle { create_before_destroy = true }
}

# Se crean antes que la instancia para fijar retención y cifrado (RDS los crearía sin límite).
resource "aws_cloudwatch_log_group" "rds" {
  for_each          = toset(["postgresql", "upgrade"])
  name              = "/aws/rds/instance/${local.nombre}-db/${each.key}"
  retention_in_days = var.retencion_logs_dias
  kms_key_id        = aws_kms_key.principal.arn
}

resource "aws_db_instance" "principal" {
  identifier     = "${local.nombre}-db"
  engine         = "postgres"
  engine_version = var.db_version
  instance_class = var.db_clase

  db_name  = "rieti_db"
  username = "rieti_admin"
  # RDS genera la contraseña, la guarda en Secrets Manager (cifrada con nuestra CMK) y la rota.
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.principal.arn

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.principal.arn

  db_subnet_group_name   = aws_db_subnet_group.principal.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name
  publicly_accessible    = false
  multi_az               = var.db_multi_az
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  backup_retention_period    = var.db_backup_dias
  backup_window              = "08:00-09:00" # 02:00-03:00 hora de México
  maintenance_window         = "sun:09:30-sun:10:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.nombre}-db-final"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  depends_on = [aws_cloudwatch_log_group.rds]

  lifecycle {
    # Las actualizaciones menores automáticas no deben provocar drift.
    ignore_changes = [engine_version]
  }
}
