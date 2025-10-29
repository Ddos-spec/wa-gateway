-- Migration untuk multiple webhooks
-- Buat tabel baru untuk webhooks (satu session bisa punya banyak webhooks)

CREATE TABLE IF NOT EXISTS "public"."webhooks" (
  "id" SERIAL PRIMARY KEY,
  "session_id" INTEGER NOT NULL,
  "webhook_url" TEXT NOT NULL,
  "webhook_events" JSONB DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "document": false, "individual": true, "update_status": true, "sticker": false}'::jsonb,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhooks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions" ("id") ON DELETE CASCADE
);

CREATE INDEX "idx_webhooks_session_id" ON "public"."webhooks" ("session_id");
CREATE INDEX "idx_webhooks_is_active" ON "public"."webhooks" ("is_active");

-- Alter sessions table untuk menambah pairing_method (qr atau phone)
ALTER TABLE "public"."sessions" 
ADD COLUMN IF NOT EXISTS "pairing_method" VARCHAR(20) DEFAULT 'qr',
ADD COLUMN IF NOT EXISTS "paired_phone" VARCHAR(20) NULL;

-- Index untuk pairing method
CREATE INDEX IF NOT EXISTS "idx_sessions_pairing_method" ON "public"."sessions" ("pairing_method");
