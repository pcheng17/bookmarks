# Bookmarks App

A minimal bookmark app built with vanilla HTML, CSS, and JavaScript for deployment on Cloudflare Workers with D1 and R2.

## Features

- Craigslist-style minimal design
- Save links by pasting URL and pressing Enter
- Automatically captures page snapshots to R2
- Add descriptions and tags to bookmarks
- View saved page snapshots
- Delete bookmarks

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create D1 database:
```bash
npm run db:create
```

3. Update `wrangler.toml` with your D1 database ID

4. Create database schema:
```bash
npm run db:migrate
```

5. Create R2 bucket:
```bash
npm run r2:create
```

6. Run locally:
```bash
npm run dev
```

7. Deploy to Cloudflare:
```bash
npm run deploy
```

## Usage

1. Paste a URL in the input field and press Enter
2. The link will be saved and a snapshot stored in R2
3. Click the triple dots (⋯) next to any bookmark to edit or delete
4. Click "view snapshot" to see the saved page content

## Database Schema

The app uses a simple D1 SQLite database with one table:

- `id`: Auto-incrementing primary key
- `url`: The bookmarked URL
- `title`: Page title (auto-extracted)
- `description`: User-added description
- `tags`: Comma-separated tags
- `snapshot_key`: R2 key for the page snapshot
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp