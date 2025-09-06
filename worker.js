export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Handle login page
        if (request.method === 'GET' && url.pathname === '/login') {
            return new Response(await getStaticFile('login.html'), {
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
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
        
        // Check authentication for all other routes
        const isAuthenticated = await checkAuthentication(request, env);
        if (!isAuthenticated) {
            return new Response('', {
                status: 302,
                headers: { 'Location': '/login' }
            });
        }
        
        if (request.method === 'GET' && url.pathname === '/') {
            return new Response(await getStaticFile('index.html'), {
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
        if (request.method === 'GET' && url.pathname === '/styles.css') {
            return new Response(await getStaticFile('styles.css'), {
                headers: { 'Content-Type': 'text/css' }
            });
        }
        
        if (request.method === 'GET' && url.pathname === '/app.js') {
            return new Response(await getStaticFile('app.js'), {
                headers: { 'Content-Type': 'application/javascript' }
            });
        }
        
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
        
        return new Response('Not found', { status: 404 });
    }
};

async function getStaticFile(filename) {
    const files = {
        'login.html': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>login - bookmarks</title>
    <style>
        body {
            font-family: verdana, arial, helvetica, sans-serif;
            font-size: 10pt;
            background-color: #ffffff;
            margin: 0;
            padding: 20px;
            line-height: 1.3;
        }

        .container {
            max-width: 400px;
            margin: 100px auto;
            text-align: center;
        }

        h1 {
            font-size: 14pt;
            font-weight: normal;
            margin: 0 0 30px 0;
            color: #000000;
        }

        .login-form {
            border: 1px solid #cccccc;
            padding: 30px;
            background-color: #f5f5f5;
        }

        input[type="password"] {
            width: 200px;
            padding: 6px;
            font-family: verdana, arial, helvetica, sans-serif;
            font-size: 10pt;
            border: 1px solid #cccccc;
            margin-bottom: 15px;
        }

        button {
            padding: 6px 12px;
            font-family: verdana, arial, helvetica, sans-serif;
            font-size: 10pt;
            border: 1px solid #cccccc;
            background: #f0f0f0;
            cursor: pointer;
        }

        button:hover {
            background: #e0e0e0;
        }

        .error {
            color: #cc0000;
            font-size: 9pt;
            margin-top: 10px;
        }

        .info {
            color: #666666;
            font-size: 9pt;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>bookmarks</h1>
        
        <div class="login-form">
            <div class="info">enter password to access bookmarks</div>
            
            <form id="login-form">
                <input type="password" id="password" placeholder="password" required>
                <br>
                <button type="submit">login</button>
            </form>
            
            <div id="error-message" class="error" style="display: none;"></div>
        </div>
    </div>

    <script>
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('error-message');
            
            try {
                const response = await fetch('/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ password })
                });
                
                if (response.ok) {
                    window.location.href = '/';
                } else {
                    errorDiv.textContent = 'incorrect password';
                    errorDiv.style.display = 'block';
                    document.getElementById('password').value = '';
                }
            } catch (error) {
                errorDiv.textContent = 'login failed';
                errorDiv.style.display = 'block';
            }
        });
    </script>
</body>
</html>`,
        'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>bookmarks</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <h1>bookmarks <a href="/logout" style="font-size: 8pt; color: #666; float: right; text-decoration: none;">logout</a></h1>
        
        <form id="bookmark-form">
            <input type="url" id="url-input" placeholder="paste link here" required>
            <button type="submit" style="display: none;"></button>
        </form>

        <div id="bookmarks-list"></div>
    </div>

    <div id="edit-modal" class="modal">
        <div class="modal-content">
            <span class="close">&times;</span>
            <h3>edit bookmark</h3>
            <form id="edit-form">
                <input type="hidden" id="edit-id">
                <label>description:</label>
                <input type="text" id="edit-description" placeholder="add description">
                <label>tags:</label>
                <input type="text" id="edit-tags" placeholder="add tags (comma separated)">
                <button type="submit">save</button>
            </form>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>`,
        'styles.css': `body {
    font-family: verdana, arial, helvetica, sans-serif;
    font-size: 10pt;
    background-color: #ffffff;
    margin: 0;
    padding: 20px;
    line-height: 1.3;
}

.container {
    max-width: 800px;
    margin: 0 auto;
}

h1 {
    font-size: 14pt;
    font-weight: normal;
    margin: 0 0 20px 0;
    color: #000000;
}

#bookmark-form {
    margin-bottom: 30px;
}

#url-input {
    width: 400px;
    padding: 4px;
    font-family: verdana, arial, helvetica, sans-serif;
    font-size: 10pt;
    border: 1px solid #cccccc;
}

.bookmark-item {
    border-bottom: 1px solid #cccccc;
    padding: 10px 0;
    position: relative;
}

.bookmark-url {
    color: #0000ee;
    text-decoration: underline;
    font-size: 10pt;
    margin-bottom: 3px;
}

.bookmark-url:hover {
    color: #551a8b;
}

.bookmark-description {
    color: #666666;
    font-size: 9pt;
    margin: 3px 0;
}

.bookmark-tags {
    color: #008000;
    font-size: 9pt;
    margin: 3px 0;
}

.bookmark-meta {
    color: #666666;
    font-size: 9pt;
    margin: 3px 0;
}

.bookmark-actions {
    position: absolute;
    right: 0;
    top: 10px;
    cursor: pointer;
    font-size: 12pt;
    user-select: none;
}

.bookmark-actions:hover {
    color: #333333;
}

.actions-menu {
    position: absolute;
    right: 0;
    top: 20px;
    background: white;
    border: 1px solid #cccccc;
    padding: 5px;
    display: none;
    z-index: 100;
}

.actions-menu a {
    display: block;
    color: #0000ee;
    text-decoration: underline;
    font-size: 9pt;
    padding: 2px 0;
    cursor: pointer;
}

.actions-menu a:hover {
    color: #551a8b;
}

.modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.4);
}

.modal-content {
    background-color: #fefefe;
    margin: 15% auto;
    padding: 20px;
    border: 1px solid #888;
    width: 400px;
    font-family: verdana, arial, helvetica, sans-serif;
}

.close {
    color: #aaa;
    float: right;
    font-size: 20px;
    font-weight: bold;
    cursor: pointer;
}

.close:hover {
    color: black;
}

.modal-content h3 {
    font-size: 11pt;
    font-weight: normal;
    margin: 0 0 15px 0;
}

.modal-content label {
    display: block;
    font-size: 9pt;
    margin: 10px 0 3px 0;
    color: #666666;
}

.modal-content input[type="text"] {
    width: 380px;
    padding: 4px;
    font-family: verdana, arial, helvetica, sans-serif;
    font-size: 10pt;
    border: 1px solid #cccccc;
    margin-bottom: 10px;
}

.modal-content button {
    padding: 4px 8px;
    font-family: verdana, arial, helvetica, sans-serif;
    font-size: 10pt;
    border: 1px solid #cccccc;
    background: #f0f0f0;
    cursor: pointer;
}

.modal-content button:hover {
    background: #e0e0e0;
}`,
        'app.js': `class BookmarkApp {
    constructor() {
        this.bookmarks = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadBookmarks();
    }

    bindEvents() {
        const form = document.getElementById('bookmark-form');
        const urlInput = document.getElementById('url-input');
        const modal = document.getElementById('edit-modal');
        const closeModal = document.querySelector('.close');
        const editForm = document.getElementById('edit-form');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBookmark(urlInput.value.trim());
            urlInput.value = '';
        });

        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });

        closeModal.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateBookmark();
        });
    }

    async saveBookmark(url) {
        if (!url) return;

        // Check if URL already exists
        const existingBookmark = this.bookmarks.find(b => b.url === url);
        if (existingBookmark) {
            console.log('URL already bookmarked:', url);
            return;
        }

        try {
            const response = await fetch('/api/bookmarks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });

            if (response.ok) {
                this.loadBookmarks();
            } else if (response.status === 409) {
                console.log('URL already bookmarked');
            } else {
                console.error('Failed to save bookmark');
            }
        } catch (error) {
            console.error('Error saving bookmark:', error);
        }
    }

    async loadBookmarks() {
        try {
            const response = await fetch('/api/bookmarks');
            if (response.ok) {
                this.bookmarks = await response.json();
                this.renderBookmarks();
            }
        } catch (error) {
            console.error('Error loading bookmarks:', error);
        }
    }

    renderBookmarks() {
        const container = document.getElementById('bookmarks-list');
        container.innerHTML = '';

        this.bookmarks.forEach(bookmark => {
            const item = document.createElement('div');
            item.className = 'bookmark-item';
            item.innerHTML = \`
                <div class="bookmark-url">
                    <a href="\${bookmark.url}" target="_blank">\${bookmark.title || this.getDomainFromUrl(bookmark.url)}</a>
                    <span style="color: #666666; font-size: 9pt; margin-left: 10px;">\${new Date(bookmark.created_at).toLocaleDateString()}</span>
                </div>
                \${bookmark.description ? \`<div class="bookmark-description">\${bookmark.description}</div>\` : ''}
                \${bookmark.tags ? \`<div class="bookmark-tags">\${bookmark.tags}</div>\` : ''}
                <div class="bookmark-actions" data-id="\${bookmark.id}">⋯</div>
                <div class="actions-menu" id="menu-\${bookmark.id}">
                    <a onclick="app.editBookmark(\${bookmark.id})">edit</a>
                    <a href="/snapshot/\${bookmark.id}" target="_blank">view snapshot</a>
                    <a onclick="app.deleteBookmark(\${bookmark.id})">delete</a>
                </div>
            \`;
            container.appendChild(item);
        });

        document.querySelectorAll('.bookmark-actions').forEach(action => {
            action.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                const menu = document.getElementById(\`menu-\${id}\`);
                
                document.querySelectorAll('.actions-menu').forEach(m => {
                    if (m !== menu) m.style.display = 'none';
                });
                
                menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
            });
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.actions-menu').forEach(menu => {
                menu.style.display = 'none';
            });
        });
    }

    getDomainFromUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return url;
        }
    }

    editBookmark(id) {
        const bookmark = this.bookmarks.find(b => b.id === id);
        if (!bookmark) return;

        document.getElementById('edit-id').value = id;
        document.getElementById('edit-description').value = bookmark.description || '';
        document.getElementById('edit-tags').value = bookmark.tags || '';
        document.getElementById('edit-modal').style.display = 'block';
    }

    async updateBookmark() {
        const id = document.getElementById('edit-id').value;
        const description = document.getElementById('edit-description').value;
        const tags = document.getElementById('edit-tags').value;

        try {
            const response = await fetch(\`/api/bookmarks/\${id}\`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ description, tags })
            });

            if (response.ok) {
                document.getElementById('edit-modal').style.display = 'none';
                this.loadBookmarks();
            }
        } catch (error) {
            console.error('Error updating bookmark:', error);
        }
    }

    async deleteBookmark(id) {
        if (!confirm('Delete this bookmark?')) return;

        try {
            const response = await fetch(\`/api/bookmarks/\${id}\`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.loadBookmarks();
            }
        } catch (error) {
            console.error('Error deleting bookmark:', error);
        }
    }
}

const app = new BookmarkApp();`
    };
    
    return files[filename] || '';
}

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
                'SELECT snapshot_key FROM bookmarks WHERE id = ?'
            ).bind(id).first();
            
            if (bookmark && bookmark.snapshot_key) {
                await env.R2.delete(bookmark.snapshot_key);
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