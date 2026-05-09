import { defineEntity, p } from '@mikro-orm/core';
import type { User } from '@desafio/users-domain';

export class UserEntity implements User {
  id!: string;
  name!: string;
  email!: string;
  emailVerified!: boolean;
  image!: string | null;
  databaseId!: number | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const UserEntitySchema = defineEntity({
  class: UserEntity,
  className: 'UserEntity',
  tableName: 'user',
  properties: {
    id: p.string().primary(),
    name: p.string(),
    email: p.string().unique(),
    emailVerified: p.boolean().fieldName('email_verified'),
    image: p.string().nullable(),
    databaseId: p.integer().nullable().fieldName('wp_user_id'),
    createdAt: p.datetime().fieldName('created_at'),
    updatedAt: p.datetime().fieldName('updated_at'),
  },
});
