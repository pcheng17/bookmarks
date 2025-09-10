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

        // Let Cloudflare handle static assets (HTML, CSS, JS)
        // This will automatically serve files from the public/ directory
        return env.ASSETS.fetch(request);
    }
};

async function handleBookmarksAPI(request, env) {
    if (request.method === 'GET') {
        try {
            const result = await env.DB.prepare(
                'SELECT * FROM bookmarks WHERE archived = 0 ORDER BY created_at DESC'
            ).all();

            return new Response(JSON.stringify(result.results), {
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
            const existingBookmark = await env.DB.prepare(
                'SELECT id FROM bookmarks WHERE url = ?'
            ).bind(url).first();

            if (existingBookmark) {
                return new Response(JSON.stringify({ error: 'URL already bookmarked' }), {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const title = await getPageTitle(url);
            const snapshotKey = await savePageSnapshot(url, env);

            const result = await env.DB.prepare(
                'INSERT INTO bookmarks (url, title, snapshot_key) VALUES (?, ?, ?) RETURNING *'
            ).bind(url, title, snapshotKey).first();

            return new Response(JSON.stringify(result), {
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
    if (request.method === 'PUT') {
        try {
            const { description, tags, archived } = await request.json();

            const result = await env.DB.prepare(
                'UPDATE bookmarks SET description = ?, tags = ?, archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *'
            ).bind(description, tags, archived || 0, id).first();

            if (!result) {
                return new Response('Not found', { status: 404 });
            }

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

    if (request.method === 'DELETE') {
        try {
            const bookmark = await env.DB.prepare(
                'SELECT snapshot_key FROM bookmarks WHERE id = ?'
            ).bind(id).first();

            if (bookmark) {
                // Clean up R2 objects
                if (bookmark.snapshot_key) {
                    await env.R2.delete(bookmark.snapshot_key);
                }
            }

            await env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run();

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
    try {
        const bookmark = await env.DB.prepare(
            'SELECT snapshot_key FROM bookmarks WHERE id = ?'
        ).bind(id).first();

        if (!bookmark || !bookmark.snapshot_key) {
            return new Response('Snapshot not found', { status: 404 });
        }

        const snapshot = await env.R2.get(bookmark.snapshot_key);

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
