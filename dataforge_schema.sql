-- ====================================================================
-- ⚡ DataForge PostgreSQL Database Schema Setup Script
-- Project: Universal Cloud Drive (u_claude_drive)
-- ====================================================================
-- Use this script in DataForge SQL Editor (http://localhost:4000)
-- to easily initialize or rebuild all database tables and indexes.
-- ====================================================================

-- Enable UUID extension for PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. USERS TABLE ──────────────────────────────────────────────────
-- Stores user accounts, authentication hashes, and storage quotas.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    storage_limit BIGINT DEFAULT 32212254720,    -- 30 GB default quota in bytes
    used_storage BIGINT DEFAULT 0,
    is_banned BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. FOLDERS TABLE ────────────────────────────────────────────────
-- Hierarchical folder structure supporting recursive nesting.
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    is_trash BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    share_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. FILES TABLE ──────────────────────────────────────────────────
-- File metadata records mapped to Telegram channel storage messages.
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size BIGINT NOT NULL,
    mime_type TEXT,
    telegram_message_id BIGINT NOT NULL,
    telegram_file_id TEXT NOT NULL,
    is_starred BOOLEAN DEFAULT FALSE,
    is_trash BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    share_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. PERFORMANCE INDEXES ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_username ON users(telegram_username);

-- ====================================================================
-- OPTIONAL RESET COMMAND (Uncomment to completely drop all tables)
-- ====================================================================
-- DROP TABLE IF EXISTS files CASCADE;
-- DROP TABLE IF EXISTS folders CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
