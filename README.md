# Bcrypt Compatibility System

## Overview

This application includes a smart bcrypt compatibility layer that automatically selects the best bcrypt implementation for your environment:

- **bcrypt** (native C++ binding) - Used on Windows, Mac, and Linux with build tools
- **bcryptjs** (pure JavaScript) - Used on cPanel and environments without Python/build tools

## How It Works

The `bcrypt-compat.js` module automatically detects which implementation is available:

1. First tries to load `bcrypt` (faster, native implementation)
2. If that fails, falls back to `bcryptjs` (pure JavaScript, works everywhere)
3. Both provide identical functionality and API

## Performance

- **bcrypt (native)**: ~2-3x faster for hashing operations
- **bcryptjs**: Slightly slower but 100% compatible everywhere

For typical authentication use cases, the performance difference is negligible (a few milliseconds).

## Installation

### Option 1: Standard Install
```bash
npm install
```
This installs all dependencies. On cPanel, bcrypt installation will fail silently and bcryptjs will be used.

### Option 2: Smart Install (Recommended)
```bash
npm run install:smart
```
This runs an intelligent installer that handles both environments gracefully.

### Option 3: Manual cPanel Install
```bash
# Install core dependencies first
npm install bcryptjs
npm install --production
```

## Troubleshooting

### "Cannot find module 'bcrypt'" or "Cannot find module 'bcryptjs'"

Run:
```bash
npm install bcryptjs
npm install
```

### Want to force a specific implementation?

Edit `bcrypt-compat.js` and change the require statement:
```javascript
// Force bcryptjs only
module.exports = require('bcryptjs');

// Force bcrypt only (will fail on cPanel)
module.exports = require('bcrypt');
```

## Environment Detection

The compatibility layer logs which implementation it's using:
```
[bcrypt-compat] Using native bcrypt (better performance)
// or
[bcrypt-compat] Using bcryptjs (pure JavaScript implementation)
```

This message appears when the server starts. 

# cPanel Deployment Checklist - Memory Optimized

## Pre-Deployment

- [ ] Copy `.env.production` to `.env` and update all values
- [ ] Set `MAX_SESSIONS=3` (or lower) for limited memory
- [ ] Ensure `NODE_ENV=production` in `.env`

## Deployment Steps

1. **Upload Files**
   - [ ] ZIP project (exclude node_modules)
   - [ ] Upload via cPanel File Manager
   - [ ] Extract in target directory

2. **Node.js App Setup in cPanel**
   - [ ] Create Node.js Application
   - [ ] Node.js version: 16+ (prefer 18 or 20)
   - [ ] Application root: `/home/username/whatsapp-api`
   - [ ] Application startup file: `index.js`
   - [ ] **Important Environment Variables:**
     ```
     NODE_ENV=production
     NODE_OPTIONS=--max-old-space-size=1024
     ```

3. **Install Dependencies**
   - [ ] Click "Run NPM Install" in cPanel
   - [ ] Or via terminal: `npm install --production`

4. **Create Required Directories**
   ```bash
   mkdir -p logs sessions media auth_info_baileys activity_logs
   chmod 755 logs sessions media auth_info_baileys activity_logs
   ```

5. **Start Application**
   - [ ] Option 1: Click "Start" in cPanel
   - [ ] Option 2: Use PM2 (if available)
     ```bash
     npm install pm2 -g
     npm run start:pm2
     ```

## Troubleshooting Memory Issues

If you see "Out of memory" errors:

1. **Reduce Sessions**
   - Edit `.env`: `MAX_SESSIONS=2`

2. **Add to cPanel Node.js Environment**
   ```
   NODE_OPTIONS=--max-old-space-size=768 --optimize-for-size
   ```

3. **Use PM2 with Memory Limit**
   ```bash
   pm2 start ecosystem.config.js --max-memory-restart 768M
   ```

4. **Monitor Memory Usage**
   ```bash
   pm2 monit
   # or
   top -u yourusername
   ```

5. **Clear Unused Data**
   ```bash
   # Clear old logs
   find logs/ -name "*.log" -mtime +7 -delete
   
   # Clear old session files
   find sessions/ -name "*" -mtime +1 -delete
   ```

## Post-Deployment

- [ ] Test login at `/admin/login.html`
- [ ] Create a test session
- [ ] Send a test message
- [ ] Check logs for errors
- [ ] Set up monitoring (UptimeRobot, etc.)

## Emergency Commands

```bash
# Stop application
pm2 stop whatsapp-api

# View logs
pm2 logs whatsapp-api --lines 100

# Restart with lower memory
pm2 restart whatsapp-api --max-memory-restart 512M

# Clear all PM2 apps
pm2 delete all
```

## Support

If memory issues persist:
1. Contact hosting provider about memory limits
2. Consider VPS hosting instead of shared hosting
3. Reduce features or number of concurrent sessions 

# 📱 WhatsApp API Server - Complete cPanel Deployment Guide for Beginners

This guide will walk you through deploying the Super Light Web WhatsApp API Server on cPanel hosting, step by step. No prior experience required!

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Preparing Your Files](#preparing-your-files)
3. [Uploading to cPanel](#uploading-to-cpanel)
4. [Setting Up Node.js Application](#setting-up-nodejs-application)
5. [Configuring Environment Variables](#configuring-environment-variables)
6. [Installing Dependencies](#installing-dependencies)
7. [Starting Your Application](#starting-your-application)
8. [Setting Up Domain/Subdomain](#setting-up-domain-subdomain)
9. [Testing Your Installation](#testing-your-installation)
10. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## 1. Prerequisites

Before starting, make sure you have:

✅ **cPanel hosting account** with:
- Node.js support (version 14 or higher)
- At least 1GB RAM allocated
- Terminal/SSH access (optional but helpful)

✅ **The following information from your hosting provider:**
- cPanel login URL (usually `https://yourdomain.com:2083`)
- cPanel username and password

✅ **Downloaded the application files** from:
- https://github.com/Alucard0x1/Super-Light-Web-WhatsApp-API-Server

---

## 2. Preparing Your Files

### Step 1: Download the Application

1. Go to https://github.com/Alucard0x1/Super-Light-Web-WhatsApp-API-Server
2. Click the green **"Code"** button
3. Select **"Download ZIP"**
4. Extract the ZIP file on your computer

### Step 2: Create Production Configuration

1. In the extracted folder, find the file `.env.example`
2. Create a copy and rename it to `.env`
3. Open `.env` in a text editor (like Notepad)
4. Update these important settings:

```env
# REQUIRED: Set a strong password for admin dashboard
ADMIN_DASHBOARD_PASSWORD=your_strong_password_here

# REQUIRED: Generate a random key (use a password generator)
TOKEN_ENCRYPTION_KEY=generate_64_character_random_string_here

# REQUIRED: Generate another random string
SESSION_SECRET=generate_32_character_random_string_here

# Set your domain (replace with your actual domain)
BASE_URL=https://yourdomain.com

# Limit sessions for cPanel (recommended: 5)
MAX_SESSIONS=5

# Optional: API Master Key (for external API access)
MASTER_API_KEY=another_random_string_if_needed
```

💡 **Tips for generating random strings:**
- Use an online password generator
- Or use this site: https://passwordsgenerator.net/
- Make them long and complex

### Step 3: Remove Unnecessary Files

Delete these files to reduce upload size:
- `node_modules` folder (if it exists)
- `.git` folder
- Any `.log` files
- `package-lock.json` (we'll regenerate it)

---

## 3. Uploading to cPanel

### Step 1: Login to cPanel

1. Open your web browser
2. Go to your cPanel login URL
3. Enter your username and password
4. Click "Log in"

### Step 2: Open File Manager

1. In cPanel, find the **"Files"** section
2. Click on **"File Manager"**
3. Navigate to your home directory (usually shows your username)

### Step 3: Create Application Directory

1. Click **"+ Folder"** button
2. Name it: `whatsapp-api`
3. Click **"Create New Folder"**

### Step 4: Upload Files

1. Double-click to enter the `whatsapp-api` folder
2. Click **"Upload"** button
3. Drag and drop all your application files
4. Wait for upload to complete (progress bar will show)

---

## 4. Setting Up Node.js Application

### Step 1: Find Node.js Application Manager

1. Go back to cPanel home
2. In the **"Software"** section, click **"Setup Node.js App"**
3. Click **"Create Application"**

### Step 2: Configure Application

Fill in these settings:

- **Node.js version**: Select the highest available (14.x or higher)
- **Application mode**: Production
- **Application root**: `whatsapp-api`
- **Application URL**: Choose your domain or subdomain
- **Application startup file**: `index.js`

### Step 3: Create Application

1. Click **"Create"** button
2. Wait for the application to be created
3. You'll see your application listed

---

## 5. Configuring Environment Variables

### Step 1: Access Environment Variables

1. In the Node.js application list, find your app
2. Click **"Edit"** (pencil icon)
3. Scroll down to **"Environment variables"**

### Step 2: Add Variables

Click **"Add Variable"** and add each of these:

| Name | Value |
|------|-------|
| `NODE_ENV` | `production` |
| `PORT` | (leave as assigned by cPanel) |
| `ADMIN_DASHBOARD_PASSWORD` | Your chosen password |
| `TOKEN_ENCRYPTION_KEY` | Your 64-character key |
| `SESSION_SECRET` | Your 32-character secret |
| `MAX_SESSIONS` | `5` |
| `SESSION_TIMEOUT_HOURS` | `24` |

### Step 3: Save Configuration

Click **"Save"** at the bottom of the page

---

## 6. Installing Dependencies

### Method A: Using cPanel Terminal (Recommended)

1. In cPanel, find **"Advanced"** section
2. Click **"Terminal"**
3. Run these commands:

```bash
cd ~/whatsapp-api
npm install --production
```

### Method B: Using Run NPM Install Button

1. In Node.js application manager
2. Find your application
3. Click **"Run NPM Install"** button
4. Wait for completion

---

## 7. Starting Your Application

### Step 1: Initial Start

1. In Node.js application manager
2. Find your application
3. Click **"Start"** button
4. Check the status - should show "Running"

### Step 2: Verify Logs

1. Click **"View Logs"** button
2. Look for: `Server is running on port XXXXX`
3. Check for any error messages

---

## 8. Setting Up Domain/Subdomain

### Option A: Using Subdomain (Recommended)

1. In cPanel, find **"Domains"** section
2. Click **"Subdomains"**
3. Create subdomain:
   - Subdomain: `whatsapp` (or your choice)
   - Domain: Select your main domain
   - Document Root: `/home/username/whatsapp-api`
4. Click **"Create"**

### Option B: Using Existing Domain

Your Node.js app URL is already configured in step 4

---

## 9. Testing Your Installation

### Step 1: Access Admin Dashboard

1. Open your browser
2. Go to: `https://yourdomain.com/admin/dashboard.html`
   - Or: `https://whatsapp.yourdomain.com/admin/dashboard.html` (if using subdomain)
3. You should see the login page

### Step 2: Login

1. For first login, use password only:
   - Password: The one you set in `.env`
2. Click **"Login"**

### Step 3: Create First Admin User

1. Once logged in, go to **"Users"** menu
2. Create a proper admin user with email/password
3. Logout and login with the new admin account

### Step 4: Test WhatsApp Connection

1. In dashboard, create a new session
2. Scan the QR code with WhatsApp
3. Check if status shows "Connected"

---

## 10. Troubleshooting Common Issues

### Issue: "Python not found" or "bcrypt installation failed"

**This is a common issue on cPanel because bcrypt requires Python to compile.**

**Solution:**
The application now includes a dual-compatibility system that works on both cPanel and local development:

1. **Automatic Compatibility**: The app will automatically use:
   - `bcrypt` (native, faster) on Windows/Mac/Linux where it can be compiled
   - `bcryptjs` (pure JavaScript) on cPanel where compilation isn't available

2. **Installation Options**:
   - **Option A**: Run `npm install --production` (will skip bcrypt on cPanel automatically)
   - **Option B**: Run `npm run install:smart` (intelligent installer that handles both environments)

3. **If you still have issues**:
   - Delete `node_modules` folder
   - Run `npm install bcryptjs` first
   - Then run `npm install --production`

### Issue: "csurf deprecated" warning

**This is just a warning, not an error. The application will still work.**

The `csurf` package is deprecated but still functional. This warning can be safely ignored. In future versions, we'll replace it with a newer CSRF protection method.

### Issue: "Out of Memory" Error

**Solution:**
1. Create file `~/whatsapp-api/.htaccess`:
```apache
<IfModule mod_lsapi.c>
    lsapi_terminate_backends_on_exit Off
</IfModule>
```

2. Reduce `MAX_SESSIONS` in environment variables to `3`

### Issue: Application Won't Start

**Check these:**
1. Node.js version is 14 or higher
2. All environment variables are set correctly
3. No syntax errors in `.env` file
4. Port is not already in use

### Issue: Can't Access Dashboard

**Try:**
1. Check if application is running in Node.js manager
2. Verify the URL is correct
3. Check browser console for errors (F12)
4. Clear browser cache

### Issue: QR Code Not Showing

**Solutions:**
1. Refresh the page (the fix is already in v3.0)
2. Check WebSocket connection in browser console
3. Ensure no firewall blocking WebSocket

### Issue: "Permission Denied" Errors

**Fix permissions:**
1. In cPanel File Manager
2. Select all files in `whatsapp-api`
3. Click **"Permissions"**
4. Set to `755` for folders, `644` for files

### Issue: "npm install" takes too long or times out

**Solutions:**
1. Use the terminal method instead of the button
2. Try installing in smaller batches:
```bash
cd ~/whatsapp-api
npm install express
npm install @whiskeysockets/baileys
npm install --production
```

---

## 🎉 Congratulations!

Your WhatsApp API Server is now running on cPanel! 

### Next Steps:

1. **Secure Your Installation:**
   - Change default admin password
   - Create individual user accounts
   - Enable SSL (usually automatic with cPanel)

2. **Configure Webhooks (Optional):**
   - Set webhook URLs for receiving messages
   - Configure in the dashboard

3. **Monitor Performance:**
   - Check cPanel resource usage
   - Monitor error logs regularly
   - Set up email alerts for downtime

### Getting Help:

- 📖 Check the [API Documentation](api_documentation.md)
- 🐛 Report issues on [GitHub](https://github.com/Alucard0x1/Super-Light-Web-WhatsApp-API-Server/issues)
- 💬 Join our community discussions

---

## 📌 Quick Reference

### Important URLs:
- Admin Dashboard: `https://yourdomain.com/admin/dashboard.html`
- API Endpoint: `https://yourdomain.com/api/v1/`

### Default Credentials:
- First login: Use only password (from `.env`)
- Then create admin user with email

### Resource Limits:
- Max file upload: 25MB
- Recommended sessions: 5 for cPanel
- Session timeout: 24 hours

---

**Last Updated:** v3.0 - December 2024 

# 🚀 cPanel Quick Start Guide - WhatsApp API Server

## 📝 Pre-Deployment Checklist

- [ ] Download code from GitHub
- [ ] Create `.env` file from `.env.example`
- [ ] Set `ADMIN_DASHBOARD_PASSWORD` in `.env`
- [ ] Generate 64-char `TOKEN_ENCRYPTION_KEY`
- [ ] Generate 32-char `SESSION_SECRET`
- [ ] Delete `node_modules` folder
- [ ] Delete `.git` folder

## 🔧 cPanel Setup Steps

### 1️⃣ Upload Files
```
cPanel → File Manager → Create folder "whatsapp-api" → Upload all files
```

### 2️⃣ Create Node.js App
```
cPanel → Setup Node.js App → Create Application
- Node.js version: 14+
- Application root: whatsapp-api
- Startup file: index.js
- Click "Create"
```

### 3️⃣ Set Environment Variables
Add these in Node.js app settings:
```
NODE_ENV=production
ADMIN_DASHBOARD_PASSWORD=your_password
TOKEN_ENCRYPTION_KEY=your_64_char_key
SESSION_SECRET=your_32_char_key
MAX_SESSIONS=5
```

### 4️⃣ Install & Start
```bash
# In cPanel Terminal:
cd ~/whatsapp-api
npm install --production

# Or click "Run NPM Install" in Node.js manager
# Then click "Start"
```

### 5️⃣ Access Dashboard
```
https://yourdomain.com/admin/dashboard.html
```

## 🆘 Quick Fixes

| Problem | Solution |
|---------|----------|
| Out of memory | Set `MAX_SESSIONS=3` |
| App won't start | Check Node.js version ≥ 14 |
| Can't login | Check `ADMIN_DASHBOARD_PASSWORD` |
| No QR code | Refresh page (F5) |

## 📞 First Login
1. Use password only (no email)
2. Create admin user after login
3. Use email/password for future logins

---
*Full guide: [CPANEL_DEPLOYMENT_GUIDE.md](CPANEL_DEPLOYMENT_GUIDE.md)* 

# Production Deployment Guide for cPanel

## Current Production Readiness Status: **90%**

The project is mostly production-ready but needs a few configurations and considerations for cPanel deployment.

## 🔧 Recent Fixes for cPanel Deployment

### Trust Proxy Configuration
The application now properly handles reverse proxy environments (like cPanel) with:
- Express trust proxy enabled
- Rate limiting configured to work behind proxies
- Proper IP detection for security features

### Timeout Overflow Fix
Fixed 32-bit integer overflow issue that prevented session creation on some hosting environments.

### Session Management
Enhanced session handling to prevent undefined errors during WhatsApp connection initialization.

## ✅ What's Already Production-Ready

1. **Security Features**
   - ✅ Token-based authentication
   - ✅ Master API key for session creation
   - ✅ Encrypted session token storage
   - ✅ Rate limiting (30 requests/minute)
   - ✅ Input validation with validator.js
   - ✅ Helmet.js for security headers
   - ✅ File upload restrictions (type & size)
   - ✅ Session limits and timeout

2. **Application Features**
   - ✅ Multi-session support
   - ✅ Persistent sessions
   - ✅ Webhook support
   - ✅ Comprehensive logging
   - ✅ Error handling
   - ✅ Media management

## ⚠️ Required for Production Deployment

### 1. Environment Configuration
Create a `.env` file with ALL required variables:

```env
# Required Security Keys
ADMIN_DASHBOARD_PASSWORD=your_secure_password_here
SESSION_SECRET=your_random_session_secret_here
TOKEN_ENCRYPTION_KEY=your_64_character_hex_key_here
MASTER_API_KEY=your_master_api_key_here

# Optional but Recommended
PORT=3000
MAX_SESSIONS=10
SESSION_TIMEOUT_HOURS=24
WEBHOOK_URL=https://your-default-webhook.com/events
```

### 2. Process Management (Critical for cPanel)
Add PM2 for process management:

```bash
npm install pm2 --save
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'whatsapp-api',
    script: './index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

### 3. cPanel-Specific Setup

#### Step 1: Upload Files
1. ZIP your project (excluding node_modules)
2. Upload via cPanel File Manager
3. Extract in your desired directory (e.g., `/home/yourusername/whatsapp-api`)

#### Step 2: Node.js Setup in cPanel
1. Go to "Setup Node.js App" in cPanel
2. Create new application:
   - Node.js version: 16 or higher
   - Application mode: Production
   - Application root: `/home/yourusername/whatsapp-api`
   - Application URL: Choose subdomain (e.g., `api.yourdomain.com`)
   - Application startup file: `index.js`

#### Step 3: Install Dependencies
1. Click "Run NPM Install" button in cPanel
2. Or via terminal: `cd /home/yourusername/whatsapp-api && npm install`

#### Step 4: Environment Variables
1. In cPanel Node.js app settings, add environment variables
2. Or create `.env` file in project root

#### Step 5: Start Application

**Important: Memory Optimization Required**

Due to cPanel memory limitations, use the optimized start scripts:

1. **Option 1: Using cPanel Interface**
   - Set Application startup file: `index.js`
   - Add to Environment Variables:
     ```
     NODE_ENV=production
     NODE_OPTIONS=--max-old-space-size=1024
     ```

2. **Option 2: Using PM2 (Recommended)**
   ```bash
   cd /home/yourusername/whatsapp-api
   npm run start:pm2
   ```

3. **Option 3: Direct Node.js with optimizations**
   ```bash
   cd /home/yourusername/whatsapp-api
   npm run start:production
   ```

**Memory Limit Issues?**
- Reduce `MAX_SESSIONS` to 3-5 in `.env`
- Disable features you don't need
- Consider upgrading hosting plan for more memory

### 4. Security Hardening

#### Update `.htaccess` for Apache:
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
<IfModule mod_rewrite.c>
    RewriteEngine On

    # Exclude static files from being proxied
    RewriteCond %{REQUEST_URI} !^/media/
    RewriteCond %{REQUEST_URI} !^/admin/js/

    # Proxy all other requests to Node.js app
    RewriteRule ^(.*)$ http://localhost:3000/$1 [P,L]
</IfModule>
# Security Headers
<IfModule mod_headers.c>
    Header set X-Content-Type-Options "nosniff"
<FilesMatch "\.(env|enc|log|json)$">    Header set X-XSS-Protection "1; mode=block"
</IfModule>

# Protect sensitive files
<FilesMatch "\.(env|enc|log)$">
    Order allow,deny
    Deny from all
</FilesMatch>
```

### 5. Database Considerations
Currently using file-based storage. For production, consider:
- MySQL/PostgreSQL for session data
- Redis for token caching
- MongoDB for message history

### 6. Monitoring & Logging

Add production logging configuration:
```javascript
// Add to index.js
const winston = require('winston');
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});
```

### 7. SSL/HTTPS Configuration
1. Enable SSL in cPanel (Let's Encrypt)
2. Update webhook URLs to use HTTPS
3. Enforce HTTPS in application

### 8. Backup Strategy
1. Set up automated backups in cPanel
2. Include:
   - `auth_info_baileys/` directory
   - `session_tokens.enc`
   - `.env` file
   - `media/` directory

## Pre-Deployment Checklist

- [ ] Set strong passwords for all environment variables
- [ ] Generate secure encryption keys
- [ ] Test all API endpoints
- [ ] Configure domain/subdomain
- [ ] Enable SSL certificate
- [ ] Set up monitoring (UptimeRobot, etc.)
- [ ] Configure backup schedule
- [ ] Test webhook delivery
- [ ] Set appropriate file permissions:
  ```bash
  chmod 600 .env
  chmod 600 session_tokens.enc
  chmod 700 auth_info_baileys
  ```
- [ ] Remove or secure test files
- [ ] Update API documentation with production URLs
- [ ] Set up error alerting

## Performance Optimization

1. **Enable Node.js Clustering** (for multiple CPU cores):
   ```javascript
   const cluster = require('cluster');
   const numCPUs = require('os').cpus().length;
   ```

2. **Add Compression**:
   ```bash
   npm install compression
   ```

3. **Configure Nginx/Apache Caching** for static files

## Maintenance Mode

Add maintenance mode capability:
```javascript
app.use((req, res, next) => {
    if (process.env.MAINTENANCE_MODE === 'true') {
        return res.status(503).json({
            status: 'error',
            message: 'Service under maintenance'
        });
    }
    next();
});
```

## Post-Deployment

1. Monitor logs regularly
2. Set up alerts for errors
3. Review security logs
4. Update dependencies monthly
5. Test backup restoration

## 🚨 Troubleshooting Common cPanel Issues

### 1. Express Rate Limit - X-Forwarded-For Error
**Error**: `ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false`

**Solution**: Already fixed in the code. The app now has `app.set('trust proxy', true)` configured.

### 2. Timeout Overflow Warning
**Error**: `TimeoutOverflowWarning: 30240000000 does not fit into a 32-bit signed integer`

**Solution**: Already fixed. Session cleanup timeout is now capped at 24 hours maximum to prevent 32-bit overflow.

### 3. Cannot Set Properties of Undefined (sock)
**Error**: `TypeError: Cannot set properties of undefined (setting 'sock')`

**Solution**: Already fixed with proper session existence checks before setting socket properties.

### 4. Node.js Version Issues
Ensure your cPanel Node.js version is 18.x or higher:
```bash
node --version
```

### 5. Permission Issues
```bash
# Fix file permissions
chmod 755 index.js
chmod -R 755 admin/
chmod -R 777 auth_info_baileys/
chmod -R 777 logs/
chmod -R 777 media/
chmod -R 777 campaign_media/
```

### 6. Memory Issues
If you encounter memory errors, add to your `.env`:
```env
NODE_OPTIONS=--max-old-space-size=1024
```

### 7. Session Not Connecting
- Check firewall rules (ports 80, 443, and your app port)
- Verify WebSocket connections are allowed
- Check proxy_websockets is enabled in cPanel
- Ensure no ModSecurity rules are blocking WhatsApp connections

### 8. Error Logs Location
Check these logs for issues:
- Application logs: `logs/system.log`
- PM2 logs: `~/.pm2/logs/`
- cPanel error logs: `~/public_html/error_log`
- Node.js logs: Check cPanel's Node.js app error output

### 9. Environment Variables Not Loading
Ensure `.env` file:
- Is in the root directory
- Has correct permissions (644 or 600)
- Uses LF line endings (not CRLF)
- No spaces around `=` in variables

### 10. WebSocket Connection Issues
Add to your `.htaccess` if WebSockets fail:
```apache
RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/?(.*) "ws://localhost:3000/$1" [P,L]
```

### Additional Common Issues

1. **Port conflicts**: cPanel usually assigns ports automatically
2. **Memory limits**: Monitor and adjust in cPanel  
3. **File permissions**: May need to adjust after upload
4. **Node version**: Ensure cPanel supports Node.js 18.x or higher

## Support

For deployment issues:
- Check cPanel error logs
- Review Node.js app logs in cPanel
- Contact: [Telegram @Alucard0x1](https://t.me/Alucard0x1) 

# Super-Light-Web-WhatsApp-API-Server

A powerful, lightweight, and multi-session WhatsApp API server using the `@whiskeysockets/baileys` library. This project provides a complete solution for programmatic WhatsApp messaging, featuring a rich RESTful API and an interactive web dashboard for easy management and testing.

## Author

-   Creator: Alucard0x1
-   Contact: [Telegram @Alucard0x1](https://t.me/Alucard0x1)

## Table of Contents

-   [Features](#features)
-   [Security](#security)
-   [Prerequisites](#prerequisites)
-   [Installation](#installation)
-   [Usage](#usage)
-   [Admin Dashboard](#admin-dashboard)
-   [API Documentation](#api-documentation)
    -   [Authentication](#authentication)
    -   [V1 API Endpoints](#v1-api-endpoints)
    -   [Legacy API Endpoints](#legacy-api-endpoints)
-   [Important Notes](#important-notes)
-   [Contributions](#contributions)
-   [License](#license)

## Features

-   **Multi-Session Management:** Run multiple WhatsApp accounts from a single server.
-   **Multi-User System:** Role-based access control with Admin and User roles.
    -   User authentication with email/password
    -   Session ownership tracking
    -   Activity logging and audit trail
    -   Admin can manage all users and monitor all activities
    -   Users can only manage their own sessions
-   **Persistent Sessions:** Sessions automatically reconnect after a server restart.
-   **Interactive Web Dashboard:** A user-friendly interface to manage sessions and test the API.
    -   Create, delete, and view the status of all sessions.
    -   Generate and scan QR codes for authentication.
    -   View a live stream of server logs.
    -   User management interface (Admin only)
    -   Activity monitoring dashboard
-   **Full-Featured API Control Center:**
    -   Visually test all API features directly from the dashboard.
    -   Send text, images, and documents.
    -   **NEW:** Send Text + Image + Document together in one request.
    -   Upload media and see a preview before sending.
    -   Dynamically generated `cURL` examples for every action.
-   **Rich RESTful API (v1):**
    -   Secure endpoints with bearer token authentication.
    -   Endpoints for sending messages (text, image, document), uploading media, and deleting messages.
    -   Send media by uploading a file or providing a direct URL.
    -   Support for large files up to 25MB (images, documents, PDFs, Word, Excel)
-   **Webhook Support:**
    -   Configure a webhook URL to receive events for new messages and session status changes.
-   **Legacy API Support:** Includes backward-compatible endpoints for easier migration from older systems.

## Security

### 🔒 Token Encryption (Level 1 - Implemented)

Session tokens are now encrypted using AES-256-CBC encryption for enhanced security:

-   **Automatic Migration:** Existing plain JSON tokens are automatically encrypted on first run
-   **Secure Storage:** Tokens stored in `session_tokens.enc` with restricted file permissions
-   **Environment Configuration:** Encryption key stored in `.env` file (never commit this!)

#### Quick Setup:

1. Generate a secure encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Add to your `.env` file:
   ```env
   TOKEN_ENCRYPTION_KEY=your_generated_64_character_hex_key
   ```

3. Test encryption:
   ```bash
   node test-encryption.js
   ```

For advanced security options (token hashing, JWT, database storage), see [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md).

## Multi-User System

The application now includes a comprehensive multi-user system with role-based access control:

### User Roles

-   **Admin**: Full system access
    -   Can create, update, and delete users
    -   Can view and manage all sessions
    -   Can monitor all user activities
    -   Can delete system logs
    
-   **User**: Limited access
    -   Can only view and manage their own sessions
    -   Cannot delete system logs
    -   Cannot access user management

### Initial Setup

1. On first run, a default admin account is created:
   - Email: `admin@localhost`
   - Password: Value of `ADMIN_DASHBOARD_PASSWORD` from `.env`

2. Admin users can create additional users through:
   - Web interface: `/admin/users.html`
   - API: `POST /api/v1/users` (requires admin role)

### User Authentication

Users can log in using:
- Email and password (for multi-user system)
- Legacy admin password (for backward compatibility)

### Activity Logging

All user actions are logged and encrypted:
- Login attempts
- Session creation/deletion
- Message sending
- User management actions

Admins can view all activities at `/admin/activities.html`

## Prerequisites

-   Node.js (v16 or higher recommended)
-   npm (Node Package Manager)

## Installation

1.  Clone this repository:
    ```bash
    git clone https://github.com/Alucard0x1/Super-Light-Web-WhatsApp-API-Server.git
    ```
2.  Navigate to the project directory:
    ```bash
    cd Super-Light-Web-WhatsApp-API-Server
    ```
3.  Install the dependencies:
    ```bash
    npm install
    ```
    
    **For cPanel or environments without Python:**
    ```bash
    npm run install:smart
    ```
    This will automatically handle bcrypt compatibility issues.

## Usage

### For Production

To start the server, run:

```bash
node index.js
```

### For Development

To start the server with `nodemon` (which automatically restarts on file changes):

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in your `PORT` environment variable).

## 🚀 Deployment

### cPanel Hosting

For detailed instructions on deploying to cPanel hosting:

📖 **[Complete cPanel Deployment Guide](CPANEL_DEPLOYMENT_GUIDE.md)** - Step-by-step guide for beginners
⚡ **[cPanel Quick Start](CPANEL_QUICK_START.md)** - Quick reference for experienced users

Key requirements for cPanel:
- Node.js 14+ support
- At least 1GB RAM
- Set `MAX_SESSIONS=5` for optimal performance

### Other Deployment Options

- **VPS/Cloud**: Use the production scripts (`start-production.sh` or `start-production.bat`)
- **PM2**: Configuration included in `ecosystem.config.js`
- **Docker**: Coming soon

## Admin Dashboard

Access the dashboard by navigating to `/admin/dashboard.html` in your browser (e.g., `http://localhost:3000/admin/dashboard.html`).

The dashboard is the central hub for managing your WhatsApp gateway. It allows you to:
-   **Create new sessions:** Simply enter a unique ID and click "Create".
-   **Monitor session status:** See at a glance which sessions are connected, disconnected, or require a QR scan.
-   **Authenticate sessions:** Click "Get QR" to generate a code, then scan it with your WhatsApp mobile app.
-   **Test all API functionality:** Use the "API Control Center" to send messages, upload files with previews, and see example API calls in real-time.
-   **View live logs:** See a stream of events from the server to monitor activity and debug issues.

## API Documentation

For complete, interactive testing and usage examples, please use the **API Control Center** on the Admin Dashboard. A summary of the API structure is provided below.

### Authentication

All API requests to the `/api/v1/*` endpoints must be authenticated using a Bearer Token in the `Authorization` header, **except for**:
- `POST /api/v1/sessions` - Requires Master API Key (see below) OR admin dashboard login
- `GET /api/v1/sessions` - Lists all sessions (public information)

**Session Creation Authentication:**
- **Via API**: Requires `X-Master-Key` header with the master API key from `.env`
- **Via Admin Dashboard**: No API key needed when logged in as admin

Your session token is returned when creating a session and also displayed in the dashboard.

**Header Formats:**
- Session operations: `Authorization: Bearer <your_session_token>`
- Create session (API): `X-Master-Key: <your_master_api_key>`

*Legacy endpoints do not require authentication.*

---

### V1 API Endpoints

**Base URL:** `/api/v1`

| Method | Endpoint        | Description                                      | Auth Required |
| :----- | :-------------- | :----------------------------------------------- | :------------ |
| `POST` | `/sessions`     | Create a new WhatsApp session.                   | Master Key†   |
| `GET`  | `/sessions`     | List all sessions with their status.             | No            |
| `DELETE`| `/sessions/:sessionId` | Delete a specific session.                | Yes           |
| `POST` | `/webhook`      | Set webhook URL for a specific session.          | Yes           |
| `GET`  | `/webhook?sessionId=xxx` | Get webhook URL for a session.        | Yes           |
| `DELETE`| `/webhook`     | Remove webhook URL for a session.                | Yes           |
| `POST` | `/media`        | Upload media file (images/documents, max 25MB).  | Yes           |
| `POST` | `/messages?sessionId=xxx` | Send text/image/document messages.    | Yes           |
| `DELETE`| `/message`      | Delete a previously sent message.                | Yes           |

† Master API Key required for API access. Admin dashboard users can create sessions without the key.

*For detailed request/response formats, please refer to the `api_documentation.md` file or use the API Control Center on the dashboard.*

---

### Legacy API Endpoints

**Base URL:** `/api`

| Method | Endpoint        | Description                                      |
| :----- | :-------------- | :----------------------------------------------- |
| `POST` | `/send-message` | (JSON body) Send a simple text message.          |
| `POST` | `/message`      | (Form-data body) Send a simple text message.     |

## Important Notes

-   **Phone Number Format:** When sending messages, use the full international phone number format (e.g., `6281234567890`) without any `+`, spaces, or leading zeros.
-   **Session Data:** Authentication data for each session is stored in the `auth_info_baileys` directory. Deleting a session via the dashboard or API will remove its corresponding folder.
-   **Media Storage:** Uploaded files are stored in the `media` directory in the project root.
-   **Terms of Service:** Ensure your use of this gateway complies with WhatsApp's terms of service.

## Contributions

Contributions, issues, and feature requests are welcome. Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.

# WhatsApp Gateway API Documentation

This document provides detailed, developer-focused instructions for using the API. For interactive testing, we recommend using the **API Control Center** on the Admin Dashboard.

## Making API Requests

### Base URLs

**Important:** The base URL format depends on your deployment environment:

| Environment | V1 API Base URL | Legacy API Base URL |
|------------|-----------------|---------------------|
| **Local Development** | `http://localhost:3000/api/v1` | `http://localhost:3000/api` |
| **cPanel (HTTP)** | `http://yourdomain.com/api/v1` | `http://yourdomain.com/api` |
| **cPanel (HTTPS)** | `https://yourdomain.com/api/v1` | `https://yourdomain.com/api` |
| **Custom Port** | `http://yourdomain.com:8080/api/v1` | `http://yourdomain.com:8080/api` |

**Note for cPanel users:** Most cPanel deployments use standard HTTP/HTTPS ports (80/443), so you don't need to specify a port in your API calls. Just use your domain name directly.

### Content-Type
For most endpoints, you will be sending data in JSON format. Ensure your requests include the `Content-Type: application/json` header. For file uploads, the API expects `multipart/form-data`.

---

## Authentication

All API requests to the `/api/v1/*` endpoints **must** be authenticated using a Bearer Token, with these exceptions:
- `POST /api/v1/sessions` - Requires Master API Key OR admin authentication
- `GET /api/v1/sessions` - Lists all sessions (public endpoint)

The token is unique per session and is returned when you create a session. You can also view tokens in the Admin Dashboard.

**Header Format:** `Authorization: Bearer <your_api_token>`

*Legacy endpoints at `/api/*` do not require authentication.*

**cURL Example (for any authenticated V1 request):**
```bash
curl ... -H "Authorization: Bearer your_api_token"
```

---

## V1 API Endpoints

**About the Examples:** Most examples in this documentation use `localhost:3000` for local development. If you're using cPanel or a production deployment:
- Replace `http://localhost:3000` with `https://yourdomain.com`
- No port number is needed for standard HTTP/HTTPS deployments
- Use HTTPS for production environments for better security

### **Session Management**

#### Create Session
Creates a new WhatsApp session with a unique ID. **Requires Master API Key OR admin dashboard authentication.**

**`POST /sessions`**

**Authentication:**
- **Via API**: Include `X-Master-Key` header with your master API key
- **Via Dashboard**: Automatic when logged in as admin

**Request Body (JSON):**
```json
{
    "sessionId": "mySession"
}
```

**Success Response (JSON):**
```json
{
    "status": "success",
    "message": "Session mySession created.",
    "token": "your-bearer-token-for-this-session"
}
```

**Note:** Save the returned token - it's required for all other API calls for this session.

**cURL Example (API Access):**
```bash
curl -X POST 'http://localhost:3000/api/v1/sessions' \
-H 'X-Master-Key: your-master-api-key-from-env' \
-H 'Content-Type: application/json' \
-d '{
    "sessionId": "mySession"
}'
```

#### List Sessions
Retrieves all sessions with their current status. **No authentication required.**

**`GET /sessions`**

**Success Response (JSON):**
```json
[
    {
        "sessionId": "mySession",
        "status": "CONNECTED",
        "detail": "Connected as John Doe",
        "qr": null,
        "token": "session-token-here"
    },
    {
        "sessionId": "anotherSession",
        "status": "DISCONNECTED",
        "detail": "Connection closed.",
        "qr": null,
        "token": "another-token-here"
    }
]
```

**cURL Example:**
```bash
curl -X GET 'http://localhost:3000/api/v1/sessions'
```

#### Delete Session
Deletes a specific session and all its data. **Requires authentication.**

**`DELETE /sessions/:sessionId`**

**cURL Example:**
```bash
curl -X DELETE 'http://localhost:3000/api/v1/sessions/mySession' \
-H 'Authorization: Bearer your_api_token'
```

---

### **Webhook Management**

#### Set Webhook URL
Configures or updates the URL where the server will send event notifications for a specific session.

**`POST /webhook`**

**Request Body (JSON):**
```json
{
    "sessionId": "mySession",
    "url": "https://your-webhook-receiver.com/events"
}
```

**cURL Example:**
```bash
curl -X POST 'http://localhost:3000/api/v1/webhook' \
-H 'Authorization: Bearer your_api_token' \
-H 'Content-Type: application/json' \
-d '{
    "sessionId": "mySession",
    "url": "https://your-webhook-receiver.com/events"
}'
```

#### Get Webhook URL
Retrieves the configured webhook URL for a specific session.

**`GET /webhook?sessionId=<your_session_id>`**

**Success Response (JSON):**
```json
{
    "status": "success",
    "sessionId": "mySession",
    "url": "https://your-webhook-receiver.com/events"
}
```

**cURL Example:**
```bash
curl -X GET 'http://localhost:3000/api/v1/webhook?sessionId=mySession' \
-H 'Authorization: Bearer your_api_token'
```

#### Delete Webhook
Removes the webhook URL for a specific session. No events will be sent until a new webhook is set.

**`DELETE /webhook`**

**Request Body (JSON):**
```json
{
    "sessionId": "mySession"
}
```

**cURL Example:**
```bash
curl -X DELETE 'http://localhost:3000/api/v1/webhook' \
-H 'Authorization: Bearer your_api_token' \
-H 'Content-Type: application/json' \
-d '{
    "sessionId": "mySession"
}'
```

---

### **Media Management**

#### Upload Media
Uploads an image or document to the server's `media` directory. The server returns a `mediaId` which can be used to send the file in a subsequent API call.

**File Restrictions:**
- **Allowed types:** JPEG, PNG, PDF only
- **Maximum size:** 5MB
- **MIME types:** `image/jpeg`, `image/png`, `application/pdf`

**`POST /media`**

**Request Body (form-data):**
- `file`: The media file to upload (must be JPEG, PNG, or PDF; max 5MB).

**Success Response (JSON):**
```json
{
    "status": "success",
    "message": "File uploaded successfully.",
    "mediaId": "f7e3e7a0-5e7a-4b0f-8b9a-9e7d6e6e2c3d.jpg",
    "url": "/media/f7e3e7a0-5e7a-4b0f-8b9a-9e7d6e6e2c3d.jpg"
}
```

**Error Response (JSON):**
```json
{
    "status": "error",
    "message": "Invalid file type. Only JPEG, PNG, and PDF allowed."
}
```

**cURL Example:**
```bash
# Replace /path/to/your/file.jpg with the actual file path
curl -X POST 'http://localhost:3000/api/v1/media' \
-H 'Authorization: Bearer your_api_token' \
-F 'file=@/path/to/your/file.jpg'
```
---

### **Message Management**

#### Send Messages
A powerful and flexible endpoint to send various types of messages. You must specify the `sessionId` as a query parameter. You can send a single message (as a JSON object) or multiple messages in a batch (as a JSON array).

**`POST /messages?sessionId=<your_session_id>`**

**Common Body Fields (JSON):**
- `recipient_type` (string, required): `individual` or `group`.
- `to` (string, required): The phone number (e.g., `628123...`) or group ID (e.g., `12036..._us`).
- `type` (string, required): `text`, `image`, or `document`.

**Type-Specific Fields:**
- **If `type` is `text`:**
  - `text` (object):
    - `body` (string, required): The message content.
- **If `type` is `image`:**
  - `image` (object):
    - `link` (string): HTTP/HTTPS URL of the image to send.
    - **OR** `id` (string): The `mediaId` of a previously uploaded image.
    - `caption` (string, optional): The image caption.
- **If `type` is `document`:**
  - `document` (object):
    - `link` (string): HTTP/HTTPS URL of the document.
    - **OR** `id` (string): The `mediaId` of a previously uploaded document.
    - `mimetype` (string, required): The MIME type of the document (e.g., `application/pdf`).
    - `filename` (string, optional): The name of the file to be displayed.

**cURL Example (Single Text Message):**
```bash
curl -X POST 'http://localhost:3000/api/v1/messages?sessionId=mySession' \
-H 'Authorization: Bearer your_api_token' \
-H 'Content-Type: application/json' \
-d '{
    "recipient_type": "individual",
    "to": "6281234567890",
    "type": "text",
    "text": { "body": "Hello from the API!" }
}'
```

**cURL Example (Bulk Mixed Messages):**
```bash
curl -X POST 'http://localhost:3000/api/v1/messages?sessionId=mySession' \
-H 'Authorization: Bearer your_api_token' \
-H 'Content-Type: application/json' \
-d '[
    {
        "recipient_type": "individual",
        "to": "6281234567890",
        "type": "text",
        "text": { "body": "First message" }
    },
    {
        "recipient_type": "individual",
        "to": "6289876543210",
        "type": "image",
        "image": {
            "link": "https://picsum.photos/200",
            "caption": "This is a test image."
        }
    }
]'
```

**cURL Example (Text + Image + Document Combo):**
```bash
# Send text, image, and document to the same recipient in one request
curl -X POST 'http://localhost:3000/api/v1/messages?sessionId=mySession' \
-H 'Authorization: Bearer your_api_token' \
-H 'Content-Type: application/json' \
-d '[
    {
        "recipient_type": "individual",
        "to": "6281234567890",
        "type": "text",
        "text": { "body": "Here are the files you requested:" }
    },
    {
        "recipient_type": "individual",
        "to": "6281234567890",
        "type": "image",
        "image": {
            "link": "https://example.com/chart.png",
            "caption": "Q4 Sales Chart"
        }
    },
    {
        "recipient_type": "individual",
        "to": "6281234567890",
        "type": "document",
        "document": {
            "link": "https://example.com/report.pdf",
            "mimetype": "application/pdf",
            "filename": "Q4_Report_2023.pdf"
        }
    }
]'
```

#### Delete Message
Deletes a message that you have previously sent. You must provide the session ID, the recipient's JID, and the ID of the message to be deleted.

**`DELETE /message`**

**Request Body (JSON):**
```json
{
    "sessionId": "mySession",
    "remoteJid": "6281234567890@s.whatsapp.net",
    "messageId": "3EB0D8E8D8F9A7B6"
}
```

**cURL Example:**
```bash
curl -X DELETE 'http://localhost:3000/api/v1/message' \
-H 'Authorization: Bearer your_api_token' \
-H 'Content-Type: application/json' \
-d '{
    "sessionId": "mySession",
    "remoteJid": "6281234567890@s.whatsapp.net",
    "messageId": "3EB0D8E8D8F9A7B6"
}'
```

---

## Campaign Management API

The Campaign Management API allows you to create and manage bulk WhatsApp messaging campaigns. All campaign endpoints require authentication.

### Create Campaign
Creates a new WhatsApp campaign with recipients, message templates, and scheduling options.

**`POST /campaigns`**

**Request Body (JSON):**
```json
{
    "name": "Marketing Campaign Q1",
    "sessionId": "mySession",
    "scheduledAt": "2024-02-01T10:00:00Z",
    "message": {
        "type": "text",
        "content": "Hi {{Name}}, check out our new products at {{Company}}!"
    },
    "recipients": [
        {
            "number": "+1234567890",
            "name": "John Doe",
            "jobTitle": "CEO",
            "companyName": "ABC Corp"
        }
    ],
    "settings": {
        "delayBetweenMessages": 3000
    }
}
```

### List Campaigns
Retrieves all campaigns (filtered by user role).

**`GET /campaigns`**

**Success Response (JSON):**
```json
[
    {
        "id": "campaign_1234567890",
        "name": "Marketing Campaign Q1",
        "status": "scheduled",
        "createdBy": "admin@example.com",
        "createdAt": "2024-01-15T08:00:00Z",
        "recipientCount": 150,
        "statistics": {
            "sent": 0,
            "failed": 0,
            "total": 150
        }
    }
]
```

### Campaign Actions
Control campaign execution with these endpoints:

- **Start/Send**: `POST /campaigns/{id}/send`
- **Pause**: `POST /campaigns/{id}/pause`
- **Resume**: `POST /campaigns/{id}/resume`
- **Retry Failed**: `POST /campaigns/{id}/retry`
- **Clone**: `POST /campaigns/{id}/clone`
- **Delete**: `DELETE /campaigns/{id}`

### CSV Template Download
Download a CSV template for bulk recipient upload.

**`GET /campaigns/csv-template`**

**Success Response:** CSV file download with sample data

**cURL Example:**
```bash
curl -X GET 'http://localhost:3000/api/v1/campaigns/csv-template' \
-H 'Authorization: Bearer your_api_token' \
-o whatsapp_campaign_template.csv
```

### Preview CSV Upload
Upload and preview a CSV file before creating a campaign.

**`POST /campaigns/preview-csv`**

**Request Body (multipart/form-data):**
- `file`: CSV file with recipients

**Success Response (JSON):**
```json
{
    "success": true,
    "recipients": [
        {
            "number": "+1234567890",
            "name": "John Doe",
            "jobTitle": "CEO",
            "companyName": "ABC Corp"
        }
    ],
    "errors": []
}
```

### Export Campaign Results
Export campaign results and recipient status as CSV.

**`GET /campaigns/{id}/export`**

**Success Response:** CSV file download with campaign results

**cURL Example:**
```bash
curl -X GET 'http://localhost:3000/api/v1/campaigns/campaign_123/export' \
-H 'Authorization: Bearer your_api_token' \
-o campaign_results.csv
```

---

## Legacy API Endpoints

These endpoints are provided for backward compatibility. They are simpler but less flexible and do **not** require token authentication.

**Base URL:** `http://<your_server_address>:<port>/api`

#### Send Text (JSON)

**`POST /send-message`**

**Request Body (JSON):**
```json
{
    "sessionId": "mySession",
    "number": "6281234567890",
    "message": "This is a legacy message."
}
```

**cURL Example:**
```bash
curl -X POST 'http://localhost:3000/api/send-message' \
-H 'Content-Type: application/json' \
-d '{
    "sessionId": "mySession",
    "number": "6281234567890",
    "message": "This is a legacy message."
}'
```

#### Send Text (Form Data)

**`POST /message`**

**Request Body (form-data):**
- `phone`: The recipient's phone number.
- `message`: The text message content.
- `sessionId` (optional): The session to use. Defaults to `putra`.

**cURL Example:**
```bash
curl -X POST 'http://localhost:3000/api/message' \
-F 'phone=6281234567890' \
-F 'message=Hello from a form' \
-F 'sessionId=mySession'
```