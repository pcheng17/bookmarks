export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Handle login authentication
        if (request.method === 'POST' && url.pathname === '/auth/login') {
            return await handleLogin(request, env);
        }
        
        // Handle logout
        if (url.pathname === '/logout') {
            return new Response('', {
                status: 302,
                headers: {
                    'Location': '/login',
                    'Set-Cookie': 'auth-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
                }
            });
        }
        
        // Check authentication for protected routes
        const protectedRoutes = ['/api/', '/favicon/', '/snapshot/'];
        const isProtectedRoute = protectedRoutes.some(route => url.pathname.startsWith(route)) || url.pathname === '/';
        
        if (isProtectedRoute) {
            const isAuthenticated = await checkAuthentication(request, env);
            if (!isAuthenticated) {
                return new Response('', {
                    status: 302,
                    headers: { 'Location': '/login' }
                });
            }
        }
        
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
        
        if (url.pathname.startsWith('/favicon/')) {
            const id = url.pathname.split('/')[2];
            return await handleFavicon(request, env, id);
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
                'SELECT * FROM bookmarks ORDER BY created_at DESC'
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
            const faviconKey = await fetchFavicon(url, env);
            
            const result = await env.DB.prepare(
                'INSERT INTO bookmarks (url, title, snapshot_key, favicon_key) VALUES (?, ?, ?, ?) RETURNING *'
            ).bind(url, title, snapshotKey, faviconKey).first();
            
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
            const { description, tags } = await request.json();
            
            const result = await env.DB.prepare(
                'UPDATE bookmarks SET description = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *'
            ).bind(description, tags, id).first();
            
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
                'SELECT snapshot_key, favicon_key FROM bookmarks WHERE id = ?'
            ).bind(id).first();
            
            if (bookmark) {
                // Clean up R2 objects
                if (bookmark.snapshot_key) {
                    await env.R2.delete(bookmark.snapshot_key);
                }
                if (bookmark.favicon_key) {
                    await env.R2.delete(bookmark.favicon_key);
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

async function handleFavicon(request, env, id) {
    try {
        const bookmark = await env.DB.prepare(
            'SELECT favicon_key FROM bookmarks WHERE id = ?'
        ).bind(id).first();
        
        if (!bookmark || !bookmark.favicon_key) {
            return new Response('Favicon not found', { status: 404 });
        }
        
        const favicon = await env.R2.get(bookmark.favicon_key);
        
        if (!favicon) {
            return new Response('Favicon not found', { status: 404 });
        }
        
        return new Response(favicon.body, {
            headers: { 
                'Content-Type': favicon.httpMetadata?.contentType || 'image/x-icon',
                'Cache-Control': 'public, max-age=86400'
            }
        });
    } catch (error) {
        return new Response('Error retrieving favicon', { status: 500 });
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

async function handleLogin(request, env) {
    try {
        const { password } = await request.json();
        
        if (password === env.AUTH_PASSWORD) {
            const token = await generateAuthToken();
            
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Set-Cookie': `auth-token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
                }
            });
        } else {
            return new Response(JSON.stringify({ error: 'Invalid password' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Login failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function checkAuthentication(request, env) {
    const cookie = request.headers.get('Cookie');
    if (!cookie) return false;
    
    const authToken = cookie.split(';')
        .find(c => c.trim().startsWith('auth-token='))
        ?.split('=')[1];
    
    if (!authToken) return false;
    
    return await verifyAuthToken(authToken, env);
}

async function generateAuthToken() {
    const data = new TextEncoder().encode(Date.now().toString() + Math.random().toString());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyAuthToken(token, env) {
    // Simple token validation - in production you might want something more sophisticated
    return token && token.length === 64;
}

async function fetchFavicon(url, env) {
    try {
        const domain = getDomainFromUrl(url);
        
        // Try multiple strategies to find favicon
        const faviconUrl = await findFaviconUrl(url);
        if (!faviconUrl) {
            return null;
        }
        
        // Fetch the actual favicon
        const response = await fetch(faviconUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)'
            }
        });
        
        if (!response.ok) {
            return null;
        }
        
        const faviconData = await response.arrayBuffer();
        
        // Store in R2 with timestamp to make it unique
        const timestamp = Date.now();
        const extension = getExtensionFromContentType(response.headers.get('content-type'));
        const key = `favicons/${domain}-${timestamp}.${extension}`;
        
        await env.R2.put(key, faviconData, {
            httpMetadata: {
                contentType: response.headers.get('content-type') || 'image/x-icon'
            }
        });
        
        return key;
    } catch (error) {
        console.error('Error fetching favicon:', error);
        return null;
    }
}

async function findFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
        
        // Strategy 1: Try standard /favicon.ico
        const standardFavicon = `${baseUrl}/favicon.ico`;
        try {
            const response = await fetch(standardFavicon, { method: 'HEAD' });
            if (response.ok) {
                return standardFavicon;
            }
        } catch (e) {
            // Continue to next strategy
        }
        
        // Strategy 2: Parse HTML for favicon link tags
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)'
                }
            });
            
            if (response.ok) {
                const html = await response.text();
                
                // Look for various favicon link tags
                const faviconRegex = /<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i;
                const match = html.match(faviconRegex);
                
                if (match && match[1]) {
                    const href = match[1];
                    
                    // Convert relative URLs to absolute
                    if (href.startsWith('//')) {
                        return `${urlObj.protocol}${href}`;
                    } else if (href.startsWith('/')) {
                        return `${baseUrl}${href}`;
                    } else if (href.startsWith('http')) {
                        return href;
                    } else {
                        return `${baseUrl}/${href}`;
                    }
                }
            }
        } catch (e) {
            // Continue to fallback
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

function getDomainFromUrl(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return 'unknown';
    }
}

function getExtensionFromContentType(contentType) {
    if (!contentType) return 'ico';
    
    const typeMap = {
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/svg+xml': 'svg',
        'image/gif': 'gif'
    };
    
    return typeMap[contentType.toLowerCase()] || 'ico';
}