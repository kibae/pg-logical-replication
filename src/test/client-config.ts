import { ClientConfig } from 'pg';

// infra/docker-pg-logical-replication/docker-compose.yml
export const TestClientConfig: ClientConfig = {
  host: 'localhost',
  port: 54320,
  user: 'postgres',
  password: 'postgrespw',
  database: 'playground',
};
