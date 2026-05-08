import { defineEntity, p } from '@mikro-orm/core';
import { UserEntity, UserEntitySchema } from './user.entity.js';

export class AccountEntity {
  id!: string;
  accountId!: string;
  providerId!: string;
  userId!: UserEntity;
  accessToken!: string | null;
  refreshToken!: string | null;
  idToken!: string | null;
  accessTokenExpiresAt!: Date | null;
  refreshTokenExpiresAt!: Date | null;
  scope!: string | null;
  password!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const AccountEntitySchema = defineEntity({
  class: AccountEntity,
  className: 'AccountEntity',
  tableName: 'account',
  properties: {
    id: p.string().primary(),
    accountId: p.string().fieldName('account_id'),
    providerId: p.string().fieldName('provider_id'),
    userId: p.manyToOne(() => UserEntitySchema).fieldName('user_id'),
    accessToken: p.string().nullable().fieldName('access_token'),
    refreshToken: p.string().nullable().fieldName('refresh_token'),
    idToken: p.string().nullable().fieldName('id_token'),
    accessTokenExpiresAt: p.datetime().nullable().fieldName('access_token_expires_at'),
    refreshTokenExpiresAt: p.datetime().nullable().fieldName('refresh_token_expires_at'),
    scope: p.string().nullable(),
    password: p.string().nullable(),
    createdAt: p.datetime().fieldName('created_at'),
    updatedAt: p.datetime().fieldName('updated_at'),
  },
});
