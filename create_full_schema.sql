CREATE TABLE "public"."config" ( 
  "id" INTEGER NOT NULL DEFAULT 1 ,
  "username" VARCHAR(50) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "config_pkey" PRIMARY KEY ("id")
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
  "user_id" INTEGER NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_session_name_key" UNIQUE ("session_name")
);
CREATE TABLE "public"."session_logs" ( 
  "id" SERIAL,
  "session_id" INTEGER NULL,
  "action" VARCHAR(50) NULL,
  "details" JSONB NULL,
  "timestamp" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "public"."notifications" ( 
  "id" SERIAL,
  "user_id" INTEGER NULL,
  "type" VARCHAR(50) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "read_status" BOOLEAN NULL DEFAULT false ,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."users" ( 
  "id" SERIAL,
  "username" VARCHAR(100) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "full_name" VARCHAR(255) NULL,
  "phone" VARCHAR(20) NULL,
  "role" VARCHAR(20) NULL DEFAULT 'customer'::character varying ,
  "status" VARCHAR(20) NULL DEFAULT 'active'::character varying ,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_username_key" UNIQUE ("username"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);
CREATE TABLE "public"."subscriptions" ( 
  "id" SERIAL,
  "user_id" INTEGER NULL,
  "plan_id" INTEGER NULL,
  "status" VARCHAR(20) NULL DEFAULT 'active'::character varying ,
  "starts_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "expires_at" TIMESTAMP NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."plans" ( 
  "id" SERIAL,
  "name" VARCHAR(100) NOT NULL,
  "price" NUMERIC NOT NULL,
  "max_sessions" INTEGER NOT NULL,
  "features" JSONB NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."message_logs" ( 
  "id" SERIAL,
  "session_name" VARCHAR(255) NOT NULL,
  "from_number" VARCHAR(20) NULL,
  "to_number" VARCHAR(20) NULL,
  "message_type" VARCHAR(50) NULL,
  "message_content" TEXT NULL,
  "status" VARCHAR(20) NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."api_usage_logs" ( 
  "id" SERIAL,
  "user_id" INTEGER NULL,
  "endpoint" VARCHAR(255) NOT NULL,
  "method" VARCHAR(10) NOT NULL,
  "response_time" INTEGER NULL,
  "status_code" INTEGER NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
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
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."session_logs" ADD CONSTRAINT "session_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."api_usage_logs" ADD CONSTRAINT "api_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;