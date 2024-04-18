FROM postgres:alpine

RUN apt update && apt install -y postgresql-14-wal2json postgresql-14-decoderbufs
COPY ["./postgresql.conf", "/etc/postgresql/postgresql.conf"]
COPY ["./docker-entrypoint-initdb.d/*", "/docker-entrypoint-initdb.d/"]

