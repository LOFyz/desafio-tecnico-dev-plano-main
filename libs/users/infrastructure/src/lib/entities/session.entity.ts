import { defineEntity, p } from '@mikro-orm/core';
import type { UserEntity } from './user.entity.js';

export class SessionEntity {
  id!: string;
  expiresAt!: Date;
  token!: string;
  createdAt!: Date;
  updatedAt!: Date;
  ipAddress!: string | null;
  userAgent!: string | null;
  userId!: UserEntity;
}

export const SessionEntitySchema = defineEntity({
  class: SessionEntity,
  className: 'SessionEntity',
  tableName: 'session',
  properties: {
    id: p.string().primary(),
    expiresAt: p.datetime().fieldName('expires_at'),
    token: p.string().unique(),
    createdAt: p.datetime().fieldName('created_at'),
    updatedAt: p.datetime().fieldName('updated_at'),
    ipAddress: p.string().nullable().fieldName('ip_address'),
    userAgent: p.string().nullable().fieldName('user_agent'),
    userId: p.manyToOne('UserEntity' as any).fieldName('user_id'),
  },
});
