-- Step 1: Create database if it does not exist
-- DO $$
-- BEGIN
--     IF NOT EXISTS (
--         SELECT FROM pg_database WHERE datname = 'chatx'
--     ) THEN
--         PERFORM dblink_exec('CREATE DATABASE chatx');
--     END IF;
-- END
-- $$ LANGUAGE plpgsql;


-- Step 2: Create schema inside chatx
-- (⚠️ This must be run while already connected to chatx)
CREATE SCHEMA IF NOT EXISTS chatx;

-- CREATE SCHEMA IF NOT EXISTS chatx;
SET search_path TO chatx;

-- DROP TABLE IF EXISTS role_permissions CASCADE;
-- DROP TABLE IF EXISTS roles CASCADE;
-- DROP TABLE IF EXISTS permission_categories CASCADE;
-- DROP TABLE IF EXISTS permissions CASCADE;
-- DROP TABLE IF EXISTS role_categories CASCADE;
-- DROP TABLE IF EXISTS plans CASCADE;
-- DROP TABLE IF EXISTS brands CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP TABLE IF EXISTS workspaces CASCADE;
-- DROP TABLE IF EXISTS workspace_members CASCADE;

-- =============================
-- PLANS
-- =============================
CREATE TABLE IF NOT EXISTS plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    max_workspace INT NOT NULL,
    max_account INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    billing_cycle VARCHAR(50) NOT NULL, -- e.g., monthly, yearly
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================
-- ROLES
-- =============================
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g., SUPERADMIN, MANAGER, SUPERVISOR, AGENT
    description TEXT,  -- Description of the role
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    label VARCHAR(50),
    created_by INT, -- FK added after users table exists (see ALTER below)
    is_system_role BOOLEAN DEFAULT FALSE -- Mark default/system roles (SUPERADMIN, MANAGER, etc.)
);

-- =============================
-- USERS
-- =============================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- store hash
    department VARCHAR(255),
    role_id INT NOT NULL REFERENCES roles(id),
    plan_id INT REFERENCES plans(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_to INT REFERENCES users(id) ON DELETE SET NULL
);

-- =============================
-- Migration Script for Existing Data
-- =============================

-- =============================
-- STEP 3: Add foreign key constraint to roles.created_by
-- =============================
-- ALTER TABLE roles 
-- ADD CONSTRAINT fk_roles_created_by 
-- FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

DO $$ 
BEGIN
    ALTER TABLE roles ADD CONSTRAINT fk_roles_created_by 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================
-- STEP 4: Insert initial system roles
-- =============================
INSERT INTO roles (name, description, is_active, label, created_by, is_system_role) VALUES
  ('SUPERADMIN', 'System Super Admin', TRUE, 'CROWN', NULL, TRUE),
  ('MANAGER', 'Workspace Manager', TRUE, 'SHIELD', NULL, TRUE)
ON CONFLICT (name) DO NOTHING;
-- =============================
-- PERMISSIONS
-- =============================
CREATE TABLE IF NOT EXISTS permission_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(100) NOT NULL UNIQUE, 
    category_id INT REFERENCES permission_categories(id) ON DELETE CASCADE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- -- -- Link roles and permissions via role_permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS role_categories (
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    category_id INT REFERENCES permission_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, category_id)
);


-- Workspaces Table
CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    manager_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_users_workspaces
        FOREIGN KEY (manager_id) REFERENCES users(id)
        ON DELETE CASCADE
);

-- Workspace Members Table
CREATE TABLE IF NOT EXISTS workspace_members (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    workspace_id INT NOT NULL,
    role_in_workspace VARCHAR(50) DEFAULT 'MEMBER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_workspace_members_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON DELETE CASCADE
);

-- Brands Table
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    workspace_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_brands_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON DELETE CASCADE
);

-- Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(255) NOT NULL,
    account_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    workspace_id INT,
    brand_id INT,
    status VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_connected TIMESTAMP NULL,
    created_by INT REFERENCES users(id)
);

-- Insert initial system roles
-- INSERT INTO roles (name, description, is_active, label, created_by, is_system_role) VALUES
--   ('SUPERADMIN', 'System Super Admin', TRUE, 'SUPERADMIN', NULL, TRUE),
--   ('MANAGER', 'Workspace Manager', TRUE, 'MANAGER', NULL, TRUE)
-- ON CONFLICT (name) DO NOTHING;

INSERT INTO permission_categories (name, description) VALUES
('User Management', 'Manage system users'),
('Customer Management', 'Manage customer chats'),
('System Management', 'System-level settings'),
('Workspace Management', 'Manage system workspace')
ON CONFLICT (name) DO NOTHING;

-- -- -- Inserting data into permissions table (without category)
-- -- -- UserManagement
INSERT INTO permissions (name, code, category_id, description) VALUES
('Create User', 'user.create', 1, 'Create new users'),
('Edit User', 'user.edit', 1, 'Edit existing users'),
('Delete User', 'user.delete', 1, 'Delete users'),
('View User', 'user.view', 1, 'View user list'),
-- -- CustomerManagement
('Manage Chats', 'chat.manage', 2, 'Manage all chats'),
('View Chats', 'chat.view', 2, 'View chats'),

--SystemManagement
('Manage Account', 'account.manage', 3, 'Manage account and role'),
('Manage Plan', 'plan.manage', 4, 'View system plans'),
('Manage Workspace', 'workspace.manage', 4, 'Manage system workspace'),
('View Workspace', 'workspace.view', 4, 'View system workspace')
ON CONFLICT (code) DO NOTHING;

-- Insert role permissions with existence checks
INSERT INTO role_permissions (role_id, permission_id) VALUES
(1,1),(1,2),(1,3),(1,4),(1,7),(1,8),(1,10)
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
(2,1),(2,2),(2,3),(2,4),(2,5),(2,6),(2,7),(2,9),(2,10)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- INSERT INTO role_permissions (role_id, permission_id) VALUES
-- (3,5),(3,6),(3,8),(4,6),(4,7)
-- ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_categories (role_id, category_id) VALUES
(1, 1),(1, 2),(1, 3),(1, 4)
ON CONFLICT (role_id, category_id) DO NOTHING;

INSERT INTO role_categories (role_id, category_id) VALUES
(2,1),(2, 2),(2,3),(2, 4)
ON CONFLICT (role_id, category_id) DO NOTHING;

-- INSERT INTO role_categories (role_id, category_id) VALUES
-- (3, 2),(4,2)
-- ON CONFLICT (role_id, category_id) DO NOTHING;

INSERT INTO plans ( name, description, max_workspace, max_account, price, billing_cycle, is_active) VALUES
('Super Admin Plan', 'Unlimited access for superadmin', 999999, 999999, 0, 'lifetime', TRUE),
('Basic Plan',   'Entry level plan with limited features',   10,   1000,  9.99,  'monthly', TRUE),
('Silver Plan',  'Mid-tier plan with more capacity',         50,   5000, 29.99,  'monthly', TRUE),
('Gold Plan',    'Advanced plan with premium support',      200,  20000, 59.99,  'monthly', TRUE),
('Diamond Plan', 'All features unlocked, priority support', 999, 100000, 99.99,  'monthly', TRUE)
ON CONFLICT (name) DO NOTHING;
