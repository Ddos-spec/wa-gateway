CREATE TABLE "public"."admins" ( 
  "id" SERIAL,
  "email" VARCHAR(255) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "admins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admins_email_key" UNIQUE ("email")
);
CREATE TABLE "public"."users" ( 
  "id" SERIAL,
  "admin_id" INTEGER NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);
CREATE TABLE "public"."wa_folders" ( 
  "id" SERIAL,
  "admin_id" INTEGER NOT NULL,
  "folder_name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "wa_folders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."wa_numbers" ( 
  "id" SERIAL,
  "user_id" INTEGER NOT NULL,
  "folder_id" INTEGER NULL,
  "phone_number" VARCHAR(20) NOT NULL,
  "session_name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "wa_numbers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wa_numbers_phone_number_key" UNIQUE ("phone_number"),
  CONSTRAINT "wa_numbers_session_name_key" UNIQUE ("session_name")
);
CREATE TABLE "public"."chat_logs" ( 
  "id" SERIAL,
  "wa_number_id" INTEGER NOT NULL,
  "sender_phone" VARCHAR(20) NOT NULL,
  "recipient_phone" VARCHAR(20) NOT NULL,
  "message_content" TEXT NULL,
  "message_type" VARCHAR(50) NULL DEFAULT 'text'::character varying ,
  "direction" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "chat_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_users_email" 
ON "public"."users" (
  "email" ASC
);
CREATE INDEX "idx_users_admin_id" 
ON "public"."users" (
  "admin_id" ASC
);
CREATE INDEX "idx_wa_folders_admin_id" 
ON "public"."wa_folders" (
  "admin_id" ASC
);
CREATE INDEX "idx_wa_numbers_session_name" 
ON "public"."wa_numbers" (
  "session_name" ASC
);
CREATE INDEX "idx_wa_numbers_phone_number" 
ON "public"."wa_numbers" (
  "phone_number" ASC
);
CREATE INDEX "idx_wa_numbers_folder_id" 
ON "public"."wa_numbers" (
  "folder_id" ASC
);
CREATE INDEX "idx_wa_numbers_user_id" 
ON "public"."wa_numbers" (
  "user_id" ASC
);
CREATE INDEX "idx_chat_logs_sender_recipient" 
ON "public"."chat_logs" (
  "sender_phone" ASC,
  "recipient_phone" ASC
);
CREATE INDEX "idx_chat_logs_wa_number_id" 
ON "public"."chat_logs" (
  "wa_number_id" ASC
);
CREATE INDEX "idx_chat_logs_created_at" 
ON "public"."chat_logs" (
  "created_at" ASC
);
CREATE INDEX "idx_chat_logs_direction" 
ON "public"."chat_logs" (
  "direction" ASC
);
ALTER TABLE "public"."users" ADD CONSTRAINT "users_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."wa_folders" ADD CONSTRAINT "wa_folders_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."wa_numbers" ADD CONSTRAINT "wa_numbers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."wa_numbers" ADD CONSTRAINT "wa_numbers_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."wa_folders" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."chat_logs" ADD CONSTRAINT "chat_logs_wa_number_id_fkey" FOREIGN KEY ("wa_number_id") REFERENCES "public"."wa_numbers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
CREATE VIEW "public"."view_user_wa_details"
AS
 SELECT u.id AS user_id,
    u.email AS user_email,
    u.admin_id,
    w.id AS wa_number_id,
    w.phone_number,
    w.session_name,
    f.id AS folder_id,
    f.folder_name,
    w.created_at AS wa_created_at,
    count(c.id) AS total_messages
   FROM (((users u
     LEFT JOIN wa_numbers w ON ((u.id = w.user_id)))
     LEFT JOIN wa_folders f ON ((w.folder_id = f.id)))
     LEFT JOIN chat_logs c ON ((w.id = c.wa_number_id)))
  GROUP BY u.id, u.email, u.admin_id, w.id, w.phone_number, w.session_name, f.id, f.folder_name, w.created_at
  ORDER BY u.id, f.folder_name, w.created_at DESC;;
CREATE VIEW "public"."view_chat_summary"
AS
 SELECT w.id AS wa_number_id,
    w.phone_number,
    w.session_name,
    u.email AS user_email,
    f.folder_name,
    count(c.id) AS total_messages,
    sum(
        CASE
            WHEN ((c.direction)::text = 'incoming'::text) THEN 1
            ELSE 0
        END) AS incoming_count,
    sum(
        CASE
            WHEN ((c.direction)::text = 'outgoing'::text) THEN 1
            ELSE 0
        END) AS outgoing_count,
    max(c.created_at) AS last_message_at
   FROM (((wa_numbers w
     LEFT JOIN users u ON ((w.user_id = u.id)))
     LEFT JOIN wa_folders f ON ((w.folder_id = f.id)))
     LEFT JOIN chat_logs c ON ((w.id = c.wa_number_id)))
  GROUP BY w.id, w.phone_number, w.session_name, u.email, f.folder_name
  ORDER BY (max(c.created_at)) DESC NULLS LAST;;
