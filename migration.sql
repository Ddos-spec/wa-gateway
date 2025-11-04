-- SQL Migration Script for WA Gateway Commercial Transformation

-- Phase 1: Create ENUM types for status fields
-- This ensures data consistency and avoids magic strings.

CREATE TYPE billing_status_enum AS ENUM ('trial', 'active', 'past_due', 'canceled');
CREATE TYPE subscription_status_enum AS ENUM ('active', 'canceled', 'expired');
CREATE TYPE message_type_enum AS ENUM ('text', 'image', 'video', 'audio', 'document', 'sticker');
CREATE TYPE message_status_enum AS ENUM ('sent', 'delivered', 'read', 'failed');

-- Phase 2: Create New Tables for Multi-Tenant Architecture

-- Table: users
-- Stores customer information for authentication and billing.
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    billing_status billing_status_enum,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: plans
-- Stores the different subscription plans available to customers.
CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price INTEGER NOT NULL, -- Price in Indonesian Rupiah (IDR)
    session_limit INTEGER NOT NULL,
    message_limit INTEGER, -- NULL for unlimited
    features JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: subscriptions
-- Links users to their chosen subscription plan.
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    plan_id INTEGER REFERENCES plans(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status subscription_status_enum,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: messages
-- Logs all incoming and outgoing messages for billing and analytics.
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    message_id_from_wa VARCHAR(255),
    sender VARCHAR(50),
    recipient VARCHAR(50),
    content TEXT,
    type message_type_enum,
    status message_status_enum,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cost INTEGER DEFAULT 0
);

-- Table: api_usage_logs
-- Tracks API usage for monitoring and security.
CREATE TABLE api_usage_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    api_key_used VARCHAR(64),
    endpoint VARCHAR(255),
    ip_address INET,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status_code INTEGER
);

-- Phase 3: Modify Existing 'sessions' Table

-- Add user_id to link sessions to the new users table.
-- This is the key change for enabling the multi-tenant architecture.
ALTER TABLE sessions
ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Phase 4: Insert Sample Data for Initial Setup

-- Populate the 'plans' table with sample subscription tiers.
INSERT INTO plans (name, price, session_limit, message_limit, features) VALUES
('Basic', 500000, 1, 10000, '{"support": "standard", "api_access": true}'),
('Professional', 1500000, 5, 50000, '{"support": "priority", "api_access": true, "multi_device": true}'),
('Enterprise', 2500000, 20, NULL, '{"support": "dedicated", "api_access": true, "multi_device": true, "custom_integrations": true}');

-- End of Migration Script
