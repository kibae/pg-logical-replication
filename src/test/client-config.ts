import { ClientConfig } from 'pg';

// infra/docker-pg-logical-replication/docker-compose.yml
export const TestClientConfig: ClientConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 54320),
  user: 'postgres',
  password: 'postgrespw',
  database: 'playground',
};

console.log(TestClientConfig);
