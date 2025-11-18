# Session Fix - Auto Logout Problem

## Masalah yang Diperbaiki

Setelah login berhasil, user langsung keluar lagi (auto logout) karena:

1. **Endpoint `/api/v2/me` tidak ada** - Dashboard memanggil endpoint ini untuk verifikasi session, tapi endpoint belum dibuat
2. **Auth check menggunakan endpoint lama** - `auth-check.js` masih menggunakan `/api/v1/me`
3. **Session tidak di-save secara eksplisit** - Session cookie tidak tersimpan dengan benar
4. **Cookie settings tidak optimal** - sameSite dan secure flag tidak dikonfigurasi dengan baik

## Perbaikan yang Dilakukan

### 1. Tambah Endpoint `/api/v2/me` (api_v2.js:104-116)
```javascript
router.get('/me', requireAuth, (req, res) => {
    try {
        const user = req.session.user;
        res.status(200).json({
            email: user.email,
            role: user.role,
            id: user.id
        });
    } catch (error) {
        logger.error('Failed to get current user', 'AUTH', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to get user info' });
    }
});
```

### 2. Update auth-check.js untuk Gunakan Endpoint Baru
```javascript
async init() {
    try {
        const response = await fetch('/api/v2/me', {
            credentials: 'same-origin'  // Penting untuk kirim cookie
        });
        if (!response.ok) {
            throw new Error('Not authenticated');
        }
        this.currentUser = await response.json();
        this.onLoginSuccess();
    } catch (error) {
        console.error('Auth check failed:', error);
        this.redirectToLogin();
    }
}
```

### 3. Eksplisit Save Session Setelah Login (index.js & api_v2.js)
```javascript
// Save session explicitly
await new Promise((resolve, reject) => {
    req.session.save((err) => {
        if (err) reject(err);
        else resolve();
    });
});
```

### 4. Perbaiki Cookie Settings (index.js:155-170)
```javascript
const isProduction = process.env.NODE_ENV === 'production';
const useHttps = process.env.PUBLIC_URL?.startsWith('https://') || false;

app.use(session({
    store: new RedisStore({ client: redis.client, prefix: process.env.REDIS_SESSION_PREFIX || 'wa-gateway:session:' }),
    secret: process.env.SESSION_SECRET || 'a_very_secret_key',
    resave: false,
    saveUninitialized: false,
    name: 'wa-gateway.sid',
    cookie: {
        httpOnly: true,
        secure: useHttps,                    // Otomatis detect dari PUBLIC_URL
        sameSite: useHttps ? 'none' : 'lax', // SameSite sesuai HTTPS
        maxAge: (parseInt(process.env.SESSION_TIMEOUT_DAYS) || 1) * 24 * 60 * 60 * 1000,
    }
}));
```

### 5. Auto-initialize Auth Check (auth-check.js:96-101)
```javascript
// Initialize auth check when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Auth.init());
} else {
    Auth.init();
}
```

## Cara Test

### 1. Start Server
```bash
npm start
```

### 2. Login ke Dashboard
1. Buka browser: `https://your-domain.com/`
2. Login dengan:
   - Email: (kosongkan untuk legacy admin)
   - Password: `admin` (dari ADMIN_DASHBOARD_PASSWORD di .env)
3. Klik "Login"

### 3. Verifikasi Session Berfungsi
- Dashboard harus TETAP terbuka (tidak redirect ke login)
- User info muncul di navbar
- Session tetap aktif saat refresh page
- Logout button berfungsi dengan baik

### 4. Check Browser Console
Buka Developer Tools → Console, seharusnya TIDAK ada error:
- ✓ Tidak ada "401 Unauthorized" dari `/api/v2/me`
- ✓ Tidak ada "Not authenticated" error
- ✓ Auth check berhasil

### 5. Check Server Logs
```bash
# Seharusnya muncul log seperti ini:
[AUTH] Legacy admin login successful { sessionId: 'xxx...' }
[AUTH] User authenticated successfully
```

### 6. Test Session Persistence
1. Login
2. Refresh page beberapa kali → tetap login
3. Buka tab baru dengan URL yang sama → tetap login
4. Tunggu beberapa menit → tetap login
5. Click logout → redirect ke login page

## Troubleshooting

### Masih Auto Logout?
1. **Cek Redis berjalan**: `redis-cli ping` harus return `PONG`
2. **Cek session di Redis**: `redis-cli keys "wa-gateway:session:*"`
3. **Cek cookie di browser**: Developer Tools → Application → Cookies
   - Harus ada cookie `wa-gateway.sid`
   - HttpOnly harus true
4. **Cek browser console** untuk error messages

### Cookie Tidak Di-set?
- Pastikan `PUBLIC_URL` di .env benar (dengan https://)
- Kalau pakai proxy/load balancer, set `trust proxy` di Express
- Browser block third-party cookies? Coba disable protection

### Error "Failed to get current user"?
- Cek Redis connection
- Cek `SESSION_SECRET` di .env
- Restart server setelah ubah .env

## File yang Dimodifikasi

1. `index.js` - Session settings & login endpoint
2. `api_v2.js` - Endpoint `/me` & session save
3. `admin/js/auth-check.js` - Auth check logic & auto-init
4. `SESSION_FIX.md` - Dokumentasi (file ini)

## Summary

✅ Session sekarang di-save dengan benar ke Redis
✅ Dashboard check session via `/api/v2/me`
✅ Cookie settings optimal untuk production
✅ Auto logout problem FIXED!

User sekarang bisa login dan tetap login sampai logout manual atau session expire.
