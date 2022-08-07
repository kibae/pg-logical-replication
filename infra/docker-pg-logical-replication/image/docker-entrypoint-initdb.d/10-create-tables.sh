#!/usr/bin/env bash

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY(id),
    firstname TEXT NOT NULL,
    lastname TEXT NOT NULL,
    email VARCHAR(1000),
    phone VARCHAR(1000),
    deleted boolean NOT NULL DEFAULT false,
    created timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE TABLE user_contents (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY(id),
    user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    deleted boolean NOT NULL DEFAULT false,
    created timestamp with time zone NOT NULL DEFAULT NOW()
);
EOSQL
