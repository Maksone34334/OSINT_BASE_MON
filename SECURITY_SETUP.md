# Security Setup Guide

## Required Environment Variables

To ensure the application runs securely, you MUST set the following environment variables in your Vercel project:

### 1. OSINT API Token (Required)
\`\`\`
OSINT_API_TOKEN=your_api_token_from_leakosintapi.com
\`\`\`
Get your API token from: https://leakosintapi.com

### 2. Session Secret (Required)
\`\`\`
OSINT_SESSION_SECRET=generate_a_random_64_character_string
\`\`\`
Generate a secure random string using:
\`\`\`bash
openssl rand -hex 32
\`\`\`

### 3. User Credentials (Required)

#### Jaguar Admin User
\`\`\`
OSINT_JAGUAR_PASSWORD=your_secure_password_here
\`\`\`

#### Default Admin User (optional, only if no other users)
\`\`\`
OSINT_ADMIN_PASSWORD=your_secure_admin_password
\`\`\`

#### Additional Users (optional)
\`\`\`
OSINT_USER_1=username:password:email@example.com:admin:active
OSINT_USER_2=username2:password2:email2@example.com:user:active
\`\`\`

Format: `login:password:email:role:status`
- role: "admin" or "user"
- status: "active" or "blocked"

## How to Add Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Click "Settings" → "Environment Variables"
3. Add each variable with its value
4. Select the environments (Production, Preview, Development)
5. Click "Save"
6. Redeploy your application

## Security Best Practices

- Never commit passwords or API keys to the repository
- Use strong, unique passwords for each user
- Rotate API tokens regularly
- Keep session secrets long and random (64+ characters)
- Monitor rate limits and API usage
- Review access logs regularly

## Current Security Status

✅ API tokens stored in environment variables
✅ Passwords hashed with SHA-256
✅ Rate limiting implemented
✅ Authorization checks on all API routes
❌ OSINT_API_TOKEN not configured (search will not work)
❌ User passwords need to be set in environment variables
