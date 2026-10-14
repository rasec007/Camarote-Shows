#!/bin/sh
set -eu

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
until mc ready local; do
  sleep 2
done
for bucket in contratos financeiro rh arquivos; do
  mc mb --ignore-existing "local/$bucket"
done
mc admin policy create local camarote-app /policy.json || true
mc admin user add local "$S3_ACCESS_KEY" "$S3_SECRET_KEY" || true
mc admin policy attach local camarote-app --user "$S3_ACCESS_KEY"
