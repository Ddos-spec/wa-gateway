CREATE TABLE "public"."config" ( 
  "id" INTEGER NOT NULL DEFAULT 1 ,
  "username" VARCHAR(50) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "config_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."session_logs" ( 
  "id" SERIAL,
  "session_id" INTEGER NULL,
  "action" VARCHAR(50) NULL,
  "details" JSONB NULL,
  "timestamp" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."sessions" ( 
  "id" SERIAL,
  "session_name" VARCHAR(100) NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'offline'::character varying ,
  "wa_number" VARCHAR(20) NULL,
  "profile_name" VARCHAR(100) NULL,
  "webhook_url" TEXT NULL,
  "webhook_events" JSONB NULL DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "document": false, "individual": true, "update_status": true}'::jsonb ,
  "api_key" VARCHAR(64) NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_session_name_key" UNIQUE ("session_name")
);
CREATE TABLE "public"."webhooks" ( 
  "id" SERIAL,
  "session_id" INTEGER NOT NULL,
  "webhook_url" TEXT NOT NULL,
  "webhook_events" JSONB NULL DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "sticker": false, "document": false, "individual": true, "update_status": true}'::jsonb ,
  "is_active" BOOLEAN NULL DEFAULT true ,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_sessions_status" 
ON "public"."sessions" (
  "status" ASC
);
CREATE INDEX "idx_sessions_session_name" 
ON "public"."sessions" (
  "session_name" ASC
);
CREATE INDEX "idx_sessions_created_at" 
ON "public"."sessions" (
  "created_at" DESC
);
ALTER TABLE "public"."session_logs" ADD CONSTRAINT "session_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
