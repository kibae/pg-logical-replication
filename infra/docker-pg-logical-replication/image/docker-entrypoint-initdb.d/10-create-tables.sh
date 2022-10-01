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

CREATE TABLE huge_transaction (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY(id),
    column1 TEXT NOT NULL,
    column2 TEXT NOT NULL,
    column3 TEXT NOT NULL,
    column4 TEXT NOT NULL,
    column5 TEXT NOT NULL,
    column6 TEXT NOT NULL,
    column7 TEXT NOT NULL,
    column8 TEXT NOT NULL,
    column9 TEXT NOT NULL,
    column10 TEXT NOT NULL,
    column11 TEXT NOT NULL,
    column12 TEXT NOT NULL,
    column13 TEXT NOT NULL,
    column14 TEXT NOT NULL,
    column15 TEXT NOT NULL,
    column16 TEXT NOT NULL,
    column17 TEXT NOT NULL,
    column18 TEXT NOT NULL,
    column19 TEXT NOT NULL,
    column20 TEXT NOT NULL
);


EOSQL
