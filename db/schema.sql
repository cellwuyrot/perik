-- AEtheria v2 production PostgreSQL schema (PostgreSQL 16+)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE app_role AS ENUM ('ADMIN','GM','EDITOR','PLAYER');
CREATE TYPE visibility AS ENUM ('PUBLIC','PLAYER','GM','PRIVATE');
CREATE TYPE publication AS ENUM ('DRAFT','PUBLISHED');
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nickname varchar(32) UNIQUE NOT NULL, display_name varchar(80) NOT NULL, password_hash text NOT NULL, role app_role NOT NULL DEFAULT 'PLAYER', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE entities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type varchar(40) NOT NULL, slug varchar(100) NOT NULL, name varchar(180) NOT NULL, short_description varchar(600) NOT NULL DEFAULT '', content text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '', tags text[] NOT NULL DEFAULT '{}', visibility visibility NOT NULL DEFAULT 'PUBLIC', status publication NOT NULL DEFAULT 'PUBLISHED', featured boolean NOT NULL DEFAULT false, owner_id uuid REFERENCES users(id) ON DELETE SET NULL, fields jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(type,slug));
CREATE TABLE entity_relations (source_id uuid REFERENCES entities(id) ON DELETE CASCADE, target_id uuid REFERENCES entities(id) ON DELETE CASCADE, label varchar(80) NOT NULL DEFAULT '', PRIMARY KEY(source_id,target_id,label));
CREATE TABLE entity_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid REFERENCES entities(id) ON DELETE CASCADE, actor_id uuid REFERENCES users(id) ON DELETE SET NULL, reason varchar(120), snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE media (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(180) NOT NULL, storage_key text UNIQUE NOT NULL, mime varchar(100) NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes<=5242880), author_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id) ON DELETE SET NULL, action varchar(100) NOT NULL, target_id text, details jsonb NOT NULL DEFAULT '{}', ip_hash text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX entities_search_idx ON entities USING gin (to_tsvector('russian', coalesce(name,'')||' '||coalesce(short_description,'')||' '||coalesce(content,'')));
CREATE INDEX entities_fields_idx ON entities USING gin(fields);
CREATE INDEX versions_entity_idx ON entity_versions(entity_id,created_at DESC);
CREATE INDEX audit_created_idx ON audit_log(created_at DESC);
