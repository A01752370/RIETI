#!/usr/bin/env bash
# Crea (una sola vez) el bucket S3 del estado remoto de Terraform.
# Uso: AWS_PROFILE=<perfil> ./infra/bootstrap.sh
set -euo pipefail

REGION="mx-central-1"
CUENTA="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="rieti-tfstate-${CUENTA}-mx"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "El bucket $BUCKET ya existe."
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi

aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"SoloTLS\", \"Effect\": \"Deny\", \"Principal\": \"*\", \"Action\": \"s3:*\",
    \"Resource\": [\"arn:aws:s3:::${BUCKET}\", \"arn:aws:s3:::${BUCKET}/*\"],
    \"Condition\": {\"Bool\": {\"aws:SecureTransport\": \"false\"}}
  }]
}"
aws s3api put-bucket-tagging --bucket "$BUCKET" \
  --tagging 'TagSet=[{Key=Project,Value=RIETI},{Key=ManagedBy,Value=bootstrap}]'

echo "Listo: s3://$BUCKET"
