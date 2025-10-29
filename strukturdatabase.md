CREATE TABLE IF NOT EXISTS "public"."config" ( 
  "id" INTEGER NOT NULL DEFAULT 1 ,
  "username" VARCHAR(50) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."session_logs" ( 
  "id" SERIAL,
  "session_id" INTEGER NULL,
  "action" VARCHAR(50) NULL,
  "details" JSONB NULL,
  "timestamp" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."sessions" ( 
  "id" SERIAL,
  "session_name" VARCHAR(100) NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'offline'::character varying ,
  "wa_number" VARCHAR(20) NULL,
  "profile_name" VARCHAR(100) NULL,
  "webhook_url" TEXT NULL,
  "webhook_events" JSONB NULL DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "document": false, "individual": true, "update_status": true}'::jsonb ,
  "api_key" VARCHAR(64) NULL,
  "pairing_method" VARCHAR(20) DEFAULT 'qr',
  "paired_phone" VARCHAR(20) NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_session_name_key" UNIQUE ("session_name")
);

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

CREATE INDEX IF NOT EXISTS "idx_sessions_status" ON "public"."sessions" ("status" ASC);
CREATE INDEX IF NOT EXISTS "idx_sessions_session_name" ON "public"."sessions" ("session_name" ASC);
CREATE INDEX IF NOT EXISTS "idx_sessions_created_at" ON "public"."sessions" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_sessions_pairing_method" ON "public"."sessions" ("pairing_method");
CREATE INDEX IF NOT EXISTS "idx_webhooks_session_id" ON "public"."webhooks" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_webhooks_is_active" ON "public"."webhooks" ("is_active");

ALTER TABLE "public"."session_logs" ADD CONSTRAINT "session_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

