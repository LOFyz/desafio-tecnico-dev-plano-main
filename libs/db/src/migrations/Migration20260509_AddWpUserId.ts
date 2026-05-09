import { Migration } from '@mikro-orm/migrations';

export class Migration20260509_AddWpUserId extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "user" ADD COLUMN "wp_user_id" integer NULL;`);
    this.addSql(`CREATE INDEX "idx_user_wp_user_id" ON "user" ("wp_user_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "idx_user_wp_user_id";`);
    this.addSql(`ALTER TABLE "user" DROP COLUMN "wp_user_id";`);
  }
}
