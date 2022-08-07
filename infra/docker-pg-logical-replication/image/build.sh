#!/usr/bin/env bash

docker buildx build --platform linux/amd64,linux/arm64 -t kibaes/postgres-logical-replication-dev:14-dev-20220810 . --push