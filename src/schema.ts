import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const bookmarks = sqliteTable('bookmarks', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull(),
    title: text('title'),
    description: text('description'),
    tags: text('tags'),
    snapshotKey: text('snapshot_key'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
    // Indexes
    createdAtIdx: index('idx_bookmarks_created_at').on(table.createdAt.desc()),
    tagsIdx: index('idx_bookmarks_tags').on(table.tags)
}));
