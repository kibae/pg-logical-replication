#!/usr/bin/env bash

cd "$(dirname "$0")" || exit

docker buildx build -f ./Dockerfile-pgsql14 --platform linux/amd64,linux/arm64/v8 -t kibaes/postgres-logical-replication-dev:14 . --push
docker buildx build -f ./Dockerfile-pgsql15 --platform linux/amd64,linux/arm64/v8 -t kibaes/postgres-logical-replication-dev:15 . --push
docker buildx build -f ./Dockerfile-pgsql16 --platform linux/amd64,linux/arm64/v8 -t kibaes/postgres-logical-replication-dev:16 . --push
docker buildx build -f ./Dockerfile-pgsql17 --platform linux/amd64,linux/arm64/v8 -t kibaes/postgres-logical-replication-dev:17 . --push

