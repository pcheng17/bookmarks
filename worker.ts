import { drizzle } from 'drizzle-orm/d1';
import { bookmarks } from './src/schema';
import { eq, desc } from 'drizzle-orm';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // API endpoints
        if (url.pathname === '/api/bookmarks') {
            return await handleBookmarksAPI(request, env);
        }

        if (url.pathname.startsWith('/api/bookmarks/')) {
            const id = url.pathname.split('/')[3];
            return await handleBookmarkAPI(request, env, id);
        }

        if (url.pathname.startsWith('/snapshot/')) {
            const id = url.pathname.split('/')[2];
            return await handleSnapshot(request, env, id);
        }

        return env.ASSETS.fetch(request);
    }
};

async function handleBookmarksAPI(request, env) {
    const db = drizzle(env.DB);

    if (request.method === 'GET') {
        try {
            const result = await db
                .select()
                .from(bookmarks)
                .where(eq(bookmarks.archived, false))
                .orderBy(desc(bookmarks.createdAt));

            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    if (request.method === 'POST') {
        try {
            const { url } = await request.json();

            // Check if URL already exists
            const existingBookmark = await db
                .select({ id: bookmarks.id })
                .from(bookmarks)
                .where(eq(bookmarks.url, url))
                .limit(1);

            if (existingBookmark.length > 0) {
                return new Response(JSON.stringify({ error: 'URL already bookmarked' }), {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const title = await getPageTitle(url);
            const snapshotKey = await savePageSnapshot(url, env);

            const result = await db
                .insert(bookmarks)
                .values({
                    url,
                    title,
                    snapshotKey
                })
                .returning();

            return new Response(JSON.stringify(result[0]), {
                status: 201,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response('Method not allowed', { status: 405 });
}

async function handleBookmarkAPI(request, env, id) {
    const db = drizzle(env.DB);

    if (request.method === 'PUT') {
        try {
            const { description, tags, archived } = await request.json();

            const result = await db
                .update(bookmarks)
                .set({
                    description,
                    tags,
                    archived: archived || false,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                })
                .where(eq(bookmarks.id, parseInt(id)))
                .returning();

            if (result.length === 0) {
                return new Response('Not found', { status: 404 });
            }

            return new Response(JSON.stringify(result[0]), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    if (request.method === 'DELETE') {
        try {
            const bookmark = await db
                .select({ snapshotKey: bookmarks.snapshotKey })
                .from(bookmarks)
                .where(eq(bookmarks.id, parseInt(id)))
                .limit(1);

            if (bookmark.length > 0 && bookmark[0].snapshotKey) {
                // Clean up R2 objects
                await env.R2.delete(bookmark[0].snapshotKey);
            }

            await db
                .delete(bookmarks)
                .where(eq(bookmarks.id, parseInt(id)));

            return new Response('', { status: 204 });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response('Method not allowed', { status: 405 });
}

async function handleSnapshot(request, env, id) {
    const db = drizzle(env.DB);

    try {
        const bookmark = await db
            .select({ snapshotKey: bookmarks.snapshotKey })
            .from(bookmarks)
            .where(eq(bookmarks.id, parseInt(id)))
            .limit(1);

        if (bookmark.length === 0 || !bookmark[0].snapshotKey) {
            return new Response('Snapshot not found', { status: 404 });
        }

        const snapshot = await env.R2.get(bookmark[0].snapshotKey);

        if (!snapshot) {
            return new Response('Snapshot not found', { status: 404 });
        }

        return new Response(snapshot.body, {
            headers: { 'Content-Type': 'text/html' }
        });
    } catch (error) {
        return new Response('Error retrieving snapshot', { status: 500 });
    }
}

// Keep these utility functions the same
async function getPageTitle(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)'
            }
        });

        if (!response.ok) return url;

        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return titleMatch ? titleMatch[1].trim() : url;
    } catch {
        return url;
    }
}

async function savePageSnapshot(url, env) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)'
            }
        });

        if (!response.ok) return null;

        const html = await response.text();
        const timestamp = new Date().toISOString();
        const key = `snapshots/${timestamp}-${crypto.randomUUID()}.html`;

        await env.R2.put(key, html, {
            httpMetadata: {
                contentType: 'text/html'
            }
        });

        return key;
    } catch (error) {
        console.error('Error saving snapshot:', error);
        return null;
    }
}
