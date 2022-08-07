#!/usr/bin/env bash

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
INSERT INTO users(firstname, lastname, email, phone)
SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT) FROM generate_series(1, 1000);

INSERT INTO user_contents(user_id, title, body)
SELECT id, md5(RANDOM()::TEXT), md5(RANDOM()::TEXT) FROM users;

EOSQL
