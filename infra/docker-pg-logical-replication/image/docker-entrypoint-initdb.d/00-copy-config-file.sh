#!/usr/bin/env bash

cp /etc/postgresql/postgresql.conf "${PGDATA:-/var/lib/postgresql/data}/"
