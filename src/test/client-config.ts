import { ClientConfig } from 'pg';

// infra/docker-pg-logical-replication/docker-compose.yml
export const TestClientConfig: ClientConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: 'postgres',
  password: 'postgrespw',
  database: 'playground',
  // connectionString: `postgres://postgres:postgrespw@${process.env.POSTGRES_HOST || 'localhost'}:${Number(process.env.POSTGRES_PORT || 54320)}/playground`,
};
