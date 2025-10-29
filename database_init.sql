-- Combined Migration Script for WA Gateway
-- This script creates all necessary tables and indexes

-- Create config table if not exists
CREATE TABLE IF NOT EXISTS "public"."config" ( 
  "id" INTEGER NOT NULL DEFAULT 1,
  "username" VARCHAR(50) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "config_pkey" PRIMARY KEY ("id")
);

-- Create sessions table if not exists
CREATE TABLE IF NOT EXISTS "public"."sessions" ( 
  "id" SERIAL,
  "session_name" VARCHAR(100) NOT NULL,
  "status" VARCHAR(20) DEFAULT 'offline',
  "wa_number" VARCHAR(20),
  "profile_name" VARCHAR(100),
  "webhook_url" TEXT,
  "webhook_events" JSONB DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "document": false, "individual": true, "update_status": true}'::jsonb,
  "api_key" VARCHAR(64),
  "pairing_method" VARCHAR(20) DEFAULT 'qr',
  "paired_phone" VARCHAR(20),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_session_name_key" UNIQUE ("session_name")
);

-- Add pairing_method and paired_phone columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='sessions' AND column_name='pairing_method') THEN
        ALTER TABLE "public"."sessions" ADD COLUMN "pairing_method" VARCHAR(20) DEFAULT 'qr';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='sessions' AND column_name='paired_phone') THEN
        ALTER TABLE "public"."sessions" ADD COLUMN "paired_phone" VARCHAR(20);
    END IF;
END $$;

-- Create session_logs table if not exists
CREATE TABLE IF NOT EXISTS "public"."session_logs" ( 
  "id" SERIAL,
  "session_id" INTEGER,
  "action" VARCHAR(50),
  "details" JSONB,
  "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);

-- Create webhooks table if not exists
CREATE TABLE IF NOT EXISTS "public"."webhooks" (
  "id" SERIAL PRIMARY KEY,
  "session_id" INTEGER NOT NULL,
  "webhook_url" TEXT NOT NULL,
  "webhook_events" JSONB DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "document": false, "individual": true, "update_status": true, "sticker": false}'::jsonb,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS "idx_sessions_status" ON "public"."sessions" ("status");
CREATE INDEX IF NOT EXISTS "idx_sessions_session_name" ON "public"."sessions" ("session_name");
CREATE INDEX IF NOT EXISTS "idx_sessions_created_at" ON "public"."sessions" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_sessions_pairing_method" ON "public"."sessions" ("pairing_method");
CREATE INDEX IF NOT EXISTS "idx_webhooks_session_id" ON "public"."webhooks" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_webhooks_is_active" ON "public"."webhooks" ("is_active");

-- Add foreign key constraints if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name='session_logs_session_id_fkey' 
                   AND table_name='session_logs') THEN
        ALTER TABLE "public"."session_logs" 
        ADD CONSTRAINT "session_logs_session_id_fkey" 
        FOREIGN KEY ("session_id") 
        REFERENCES "public"."sessions" ("id") 
        ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name='webhooks_session_id_fkey' 
                   AND table_name='webhooks') THEN
        ALTER TABLE "public"."webhooks" 
        ADD CONSTRAINT "webhooks_session_id_fkey" 
        FOREIGN KEY ("session_id") 
        REFERENCES "public"."sessions" ("id") 
        ON DELETE CASCADE;
    END IF;
END $$;

-- Insert default admin user if not exists (password: admin123)
INSERT INTO "public"."config" ("id", "username", "password_hash")
VALUES (1, 'admin', '$2a$10$XQ8nF9LHwFQyJvJZE8kGHeZl4.Pk6Y4MQFB0QZvXh4xWZQ8nF9LHw')
ON CONFLICT (id) DO NOTHING;

COMMIT;
