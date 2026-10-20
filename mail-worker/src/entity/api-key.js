import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const apiKey = sqliteTable('api_key', {
	apiKeyId: integer('api_key_id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	prefix: text('prefix').notNull(),
	keyHash: text('key_hash').notNull(),
	scopes: text('scopes').notNull().default('[]'),
	status: integer('status').notNull().default(0),
	expiresAt: text('expires_at'),
	lastUsedAt: text('last_used_at'),
	createdBy: integer('created_by').notNull().default(0),
	createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export default apiKey;
