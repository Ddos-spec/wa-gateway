-- =========================================
-- POSTGRESQL DATABASE CLEANUP SCRIPT
-- WA Gateway - Remove User Role System
-- =========================================
--
-- INSTRUKSI:
-- 1. Backup database dulu sebelum menjalankan script ini!
-- 2. Copy semua query di bawah ini
-- 3. Jalankan di PostgreSQL client (psql, pgAdmin, DBeaver, etc)
-- 4. Pastikan Anda terhubung ke database 'wagateway'
--
-- =========================================

-- Step 1: Drop all views that reference user tables
DROP VIEW IF EXISTS public.view_user_wa_details CASCADE;
DROP VIEW IF EXISTS public.view_chat_summary CASCADE;

-- Step 2: Drop chat_logs table (references wa_numbers)
DROP TABLE IF EXISTS public.chat_logs CASCADE;

-- Step 3: Drop wa_numbers table (references users and wa_folders)
DROP TABLE IF EXISTS public.wa_numbers CASCADE;

-- Step 4: Drop wa_folders table (references admins)
DROP TABLE IF EXISTS public.wa_folders CASCADE;

-- Step 5: Drop users table (references admins)
DROP TABLE IF EXISTS public.users CASCADE;

-- Step 6: Drop admins table
DROP TABLE IF EXISTS public.admins CASCADE;

-- Step 7: Clean up any remaining sequences
DROP SEQUENCE IF EXISTS public.admins_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.users_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.wa_folders_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.wa_numbers_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.chat_logs_id_seq CASCADE;

-- =========================================
-- SELESAI!
-- =========================================
-- Database telah dibersihkan dari semua tabel user management.
-- Sistem sekarang hanya menggunakan ADMIN_DASHBOARD_PASSWORD dari .env
--
-- Tidak perlu membuat tabel baru, karena:
-- - Login menggunakan password dari environment variable
-- - Session disimpan di Redis
-- - WA sessions dikelola di memory + Redis
-- =========================================
