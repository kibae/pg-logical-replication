#!/usr/bin/env bash

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
INSERT INTO users(firstname, lastname, email, phone)
SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT) FROM generate_series(1, 100);

INSERT INTO user_contents(user_id, title, body)
SELECT id, md5(RANDOM()::TEXT), md5(RANDOM()::TEXT) FROM users;

WITH rd AS (SELECT MD5(RANDOM()::TEXT) AS md5)
INSERT
INTO huge_transaction
(column1, column2, column3, column4, column5, column6, column7, column8, column9, column10,
 column11, column12, column13, column14, column15, column16, column17, column18, column19,
 column20)
SELECT rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5,
       rd.md5
FROM GENERATE_SERIES(1, 500 * 1000), rd
EOSQL
