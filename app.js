class BookmarkApp {
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
            item.innerHTML = `
                <div class="bookmark-url">
                    <a href="${bookmark.url}" target="_blank">${bookmark.title || this.getDomainFromUrl(bookmark.url)}</a>
                    <span style="color: #666666; font-size: 9pt; margin-left: 10px;">${new Date(bookmark.created_at).toLocaleDateString()}</span>
                </div>
                ${bookmark.description ? `<div class="bookmark-description">${bookmark.description}</div>` : ''}
                ${bookmark.tags ? `<div class="bookmark-tags">${bookmark.tags}</div>` : ''}
                <div class="bookmark-actions" data-id="${bookmark.id}">⋯</div>
                <div class="actions-menu" id="menu-${bookmark.id}">
                    <a onclick="app.editBookmark(${bookmark.id})">edit</a>
                    <a href="/snapshot/${bookmark.id}" target="_blank">view snapshot</a>
                    <a onclick="app.deleteBookmark(${bookmark.id})">delete</a>
                </div>
            `;
            container.appendChild(item);
        });

        document.querySelectorAll('.bookmark-actions').forEach(action => {
            action.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                const menu = document.getElementById(`menu-${id}`);

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
            const response = await fetch(`/api/bookmarks/${id}`, {
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
            const response = await fetch(`/api/bookmarks/${id}`, {
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

const app = new BookmarkApp();
