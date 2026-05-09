import { defineEntity, p } from '@mikro-orm/core';

export class VerificationEntity {
  id!: string;
  identifier!: string;
  value!: string;
  expiresAt!: Date;
  createdAt!: Date | null;
  updatedAt!: Date | null;
}

export const VerificationEntitySchema = defineEntity({
  class: VerificationEntity,
  className: 'VerificationEntity',
  tableName: 'verification',
  properties: {
    id: p.string().primary(),
    identifier: p.string(),
    value: p.string(),
    expiresAt: p.datetime().fieldName('expires_at'),
    createdAt: p.datetime().nullable().fieldName('created_at'),
    updatedAt: p.datetime().nullable().fieldName('updated_at'),
  },
});
