#!/usr/bin/env bash

docker buildx build --platform linux/amd64,linux/arm64/v8 -t kibaes/postgres-logical-replication-dev:14-dev-20221002 . --push