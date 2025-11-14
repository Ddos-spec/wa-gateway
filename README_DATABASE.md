# WA Gateway - Database Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
The `.env` file has been created with your database credentials.

**For Docker deployment (internal network):**
```env
DB_HOST=postgres_scrapdatan8n
REDIS_HOST=postgres_redis
```

**For local development (external access):**
```env
DB_HOST=163.61.44.41
REDIS_HOST=163.61.44.41
```

### 3. Initialize Database
```bash
npm run init:db
```

This will:
- Create all database tables and indexes
- Set up views for analytics
- Create a default admin account

### 4. Test Database (Optional)
```bash
npm run test:db
```

### 5. Start Server
```bash
npm start
```

## Database Structure

### Tables
1. **admins** - Admin accounts
2. **users** - Regular user accounts (created by admins)
3. **wa_folders** - Folders to organize WA numbers
4. **wa_numbers** - Registered WhatsApp numbers
5. **chat_logs** - Message logs

### API Endpoints

#### Authentication
- `POST /api/dashboard/login` - Login
- `POST /api/dashboard/logout` - Logout
- `GET /api/dashboard/me` - Get current user

#### User Dashboard
- `GET /api/dashboard/wa-numbers` - Get your WA numbers
- `GET /api/dashboard/wa-numbers/:id/chats` - Get chat logs
- `POST /api/dashboard/wa-numbers/:id/send-message` - Send message
- `GET /api/dashboard/user/statistics` - Get statistics

#### Admin Panel
- `POST /api/dashboard/admin/users` - Create user
- `GET /api/dashboard/admin/users` - List users
- `POST /api/dashboard/admin/folders` - Create folder
- `POST /api/dashboard/admin/wa-numbers` - Register WA number

## Features Implemented

✅ PostgreSQL database with connection pooling
✅ Redis for session persistence
✅ User authentication system
✅ Role-based access control (admin/user)
✅ WA number management
✅ Chat logging and retrieval
✅ Folder organization
✅ Statistics and analytics
✅ RESTful API endpoints

## Troubleshooting

### Connection Issues

**Error: "getaddrinfo EAI_AGAIN"**
- You're using internal hostnames outside Docker network
- Solution: Use external IP (163.61.44.41) or run inside Docker

**Error: "Connection timeout"**
- Database server might not be accessible
- Check firewall rules
- Verify database credentials

### Database Not Found

If database doesn't exist, create it first:
```bash
createdb wagateway
```

## Documentation

- **IMPLEMENTATION_SUMMARY.md** - Complete implementation details
- **struktur database.md** - Database schema reference
- **REFACTORING.md** - Architecture and refactoring notes

## Next Steps

1. ✅ Test database connection: `npm run test:db`
2. ✅ Initialize database: `npm run init:db`
3. 🔄 Integrate with existing code (see IMPLEMENTATION_SUMMARY.md)
4. 🔄 Build frontend dashboard
5. 🔄 Deploy to production

## Support

For detailed implementation information, see:
- `IMPLEMENTATION_SUMMARY.md` - Full documentation
- `scripts/init-database.js` - Initialization script
- `scripts/test-database.js` - Test suite
