import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'user' })
export class UserEntity {
  @PrimaryKey({ type: 'text' })
  id!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', unique: true })
  email!: string;

  @Property({ fieldName: 'email_verified' })
  emailVerified!: boolean;

  @Property({ type: 'text', nullable: true })
  image: string | null = null;

  @Property({ fieldName: 'created_at' })
  createdAt!: Date;

  @Property({ fieldName: 'updated_at' })
  updatedAt!: Date;
}
