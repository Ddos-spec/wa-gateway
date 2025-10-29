# 🔧 FIX 404 ERROR - Frontend Tidak Muncul

## ❌ Masalah:
- URL: https://postgres-wa-gateaway.qk6yxt.easypanel.host/
- Error: 404 Not Found
- Frontend tidak bisa diakses

## ✅ SOLUSI LENGKAP:

---

### **1. TAMBAH PORTS** (WAJIB!)

Di dashboard Easypanel → Tab **"Ports"** → Klik **"Add Port"**

**Port untuk Frontend:**
```
Published: 80 (atau biarkan auto)
Target: 5000
```

**Port untuk API Gateway:**
```
Published: 8080 (atau biarkan auto)  
Target: 5001
```

**SAVE!**

---

### **2. UPDATE DEPLOY COMMAND**

Di dashboard Easypanel → Tab **"Deploy"** → Field **"Command"**

Masukkan:
```bash
sh start-all.sh
```

Atau jika tidak work, gunakan:
```bash
node frontend-server.js & cd backend && node server.js & cd .. && node dist/index.js & wait
```

**SAVE!**

---

### **3. SETUP DOMAIN ROUTING** (PENTING!)

Di dashboard Easypanel → Tab **"Domains"** → Klik domain Anda → **Edit**

**Details Tab:**
- HTTPS: ✅ ON
- Host: `postgres-wa-gateaway.qk6yxt.easypanel.host`
- Path: `/`

**Destination:**
- Protocol: `HTTP`
- Port: `5000` ⬅️ **INI YANG PENTING!**
- Path: `/`

**SAVE!**

---

### **4. PUSH FILE BARU KE GITHUB**

```bash
cd /app

# Add file baru
git add start-all.sh nixpacks.toml

# Commit
git commit -m "Fix: Add start script & expose ports"

# Push
git push origin master
```

---

### **5. REDEPLOY**

Di Easypanel → Klik tombol **"Deploy"** atau **"Redeploy"**

---

## 🎯 Struktur Port yang Benar:

```
External → Port 80 → Internal Port 5000 (Frontend)
External → Port 8080 → Internal Port 5001 (Gateway API)
```

---

## 📋 Checklist:

- [ ] Port 5000 sudah di-expose di tab Ports
- [ ] Port 5001 sudah di-expose di tab Ports  
- [ ] Command di tab Deploy sudah diupdate
- [ ] Domain routing ke port 5000
- [ ] File start-all.sh sudah di-push
- [ ] Redeploy aplikasi
- [ ] Test akses URL

---

## 🧪 Testing:

Setelah deploy:

**Frontend:**
```
https://postgres-wa-gateaway.qk6yxt.easypanel.host/
```

**API Gateway:**
```
https://postgres-wa-gateaway.qk6yxt.easypanel.host:8080/
```

---

## 🔍 Jika Masih 404:

1. **Check Logs** di Easypanel:
   - Apakah ada error saat start?
   - Apakah semua 3 services jalan?

2. **Check Port Binding**:
   - Pastikan frontend-server.js listen ke port 5000
   - Pastikan backend/server.js listen ke port 5000
   - Pastikan dist/index.js listen ke port 5001

3. **Verify Environment Variables**:
   - Pastikan PORT=5001 untuk gateway
   - Pastikan FRONTEND_PORT jika ada

---

## 💡 Quick Fix Command:

Jika masih error, coba command ini di Deploy tab:

```bash
PORT=5001 node frontend-server.js & FRONTEND_PORT=5000 cd backend && node server.js & node dist/index.js & wait
```

---

## 🎉 Setelah Berhasil:

Akses:
- **Dashboard**: https://postgres-wa-gateaway.qk6yxt.easypanel.host/
- **Login**: username `admin`, password `admin123`

---

**PENTING:** Port dan domain routing adalah kunci utama! Pastikan kedua hal ini sudah benar!
