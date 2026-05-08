import { defineConfig } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { config } from 'dotenv';

config();

export default defineConfig({
  driver: PostgreSqlDriver,
  host: process.env['DB_HOST'] ?? 'localhost',
  port: Number(process.env['DB_PORT'] ?? 5432),
  dbName: process.env['DB_NAME'] ?? 'desafio',
  user: process.env['DB_USER'] ?? 'desafio',
  password: process.env['DB_PASSWORD'] ?? 'desafio',
  entities: ['dist/**/*.entity.js'],
  entitiesTs: ['libs/**/*.entity.ts'],
  metadataProvider: TsMorphMetadataProvider,
  discovery: { warnWhenNoEntities: false },
  migrations: {
    path: 'libs/db/src/migrations',
    pathTs: 'libs/db/src/migrations',
  },
});
