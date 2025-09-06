# Security Setup for Bookmarks App

## Setting Up Authentication Password

To secure your bookmark app, you need to set up a password using Cloudflare secrets.

### Step 1: Set the Secret

Run this command in your terminal:

```bash
npx wrangler secret put AUTH_PASSWORD
```

When prompted, enter your secure password. This password will be encrypted and stored securely in Cloudflare's infrastructure.

### Step 2: Deploy Your App

```bash
npm run deploy
```

### Step 3: Access Your App

- Visit your deployed URL (e.g., `https://bookmarks.your-username.workers.dev`)
- You'll be redirected to the login page
- Enter the password you set in Step 1
- You're now securely logged in!

## Security Features

✅ **Encrypted Storage**: Password is encrypted in Cloudflare's secure infrastructure  
✅ **No Plain Text**: Password never appears in your code or configuration files  
✅ **Session Management**: 24-hour secure sessions with HttpOnly cookies  
✅ **Protected Endpoints**: All API endpoints require authentication  
✅ **Safe for Git**: No secrets in version control  

## Managing Your Password

### Change Password
```bash
npx wrangler secret put AUTH_PASSWORD
```

### View Existing Secrets
```bash
npx wrangler secret list
```

### Delete Secret
```bash
npx wrangler secret delete AUTH_PASSWORD
```

## Important Notes

- Never commit passwords to git
- The secret is environment-specific (dev vs production)
- Sessions expire after 24 hours for security
- Use a strong, unique password

## Logout

Click the "logout" link in the top-right corner of your bookmark app to end your session.