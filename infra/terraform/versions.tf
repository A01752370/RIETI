terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Estado remoto cifrado y versionado; `use_lockfile` usa bloqueo nativo de S3 (sin DynamoDB).
  # El bucket se crea una sola vez con infra/bootstrap.sh, que también escribe `backend.hcl`
  # (ignorado por git) con su nombre: `terraform init -backend-config=backend.hcl`.
  # Así el ID de la cuenta no queda en el repositorio público.
  backend "s3" {
    key          = "prod/terraform.tfstate"
    region       = "mx-central-1"
    encrypt      = true
    use_lockfile = true
  }
}

locals {
  nombre = "${var.proyecto}-${var.entorno}"
  tags = {
    Project     = "RIETI"
    Environment = var.entorno
    ManagedBy   = "Terraform"
    Repository  = var.github_repo
  }
}

provider "aws" {
  region = var.region
  default_tags { tags = local.tags }
}

# WAF para CloudFront solo puede crearse en us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags { tags = local.tags }
}

data "aws_caller_identity" "actual" {}
data "aws_availability_zones" "disponibles" { state = "available" }
