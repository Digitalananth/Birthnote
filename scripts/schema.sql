-- BirthNote schema. Safe to run repeatedly.

-- NOTE: the per-note columns below (note_date, display_date, gift_for, and the
-- note_* fields) moved to order_items in Phase 3. They are still created here,
-- and still added by migrate.mjs, because that is what lets one backfill path
-- serve both a pre-bulk database and a brand-new one: the script copies them
-- into order_items and then drops them. On a fresh install they exist for the
-- length of a single migration.
CREATE TABLE IF NOT EXISTS orders (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference         VARCHAR(24)     NOT NULL,
  note_date         DATE            NOT NULL,
  display_date      VARCHAR(10)     NOT NULL,
  customer_name     VARCHAR(160)    NOT NULL,
  customer_email    VARCHAR(190)    NOT NULL,
  gift_for          VARCHAR(160)         NULL,
  message           TEXT                 NULL,
  status            ENUM('pending','checking','confirmed','unavailable','paid','shipped')
                                    NOT NULL DEFAULT 'pending',
  price_paise       INT UNSIGNED    NOT NULL DEFAULT 249900,
  currency          CHAR(3)         NOT NULL DEFAULT 'INR',
  note_denomination VARCHAR(120)         NULL,
  note_condition    VARCHAR(60)          NULL,
  note_serial       VARCHAR(60)          NULL,
  note_country      VARCHAR(80)          NULL,
  admin_notes       TEXT                 NULL,
  stripe_session_id VARCHAR(255)         NULL,
  stripe_payment_id VARCHAR(255)         NULL,
  paid_at           DATETIME             NULL,
  tracking_number   VARCHAR(120)         NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_reference (reference),
  KEY idx_orders_status_created (status, created_at),
  KEY idx_orders_email (customer_email),
  KEY idx_orders_session (stripe_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only audit trail shown as the timeline on the tracking page.
CREATE TABLE IF NOT EXISTS order_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    BIGINT UNSIGNED NOT NULL,
  status      VARCHAR(32)     NOT NULL,
  note        VARCHAR(500)         NULL,
  actor       VARCHAR(40)     NOT NULL DEFAULT 'system',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_order (order_id, created_at),
  CONSTRAINT fk_events_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Guards the public request form against a single IP flooding the queue.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket      VARCHAR(120)    NOT NULL,
  hits        INT UNSIGNED    NOT NULL DEFAULT 1,
  window_start DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Phase 1: customer accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(160)    NOT NULL,
  email           VARCHAR(190)    NOT NULL,
  password_hash   VARCHAR(255)    NOT NULL,
  phone           VARCHAR(24)          NULL,
  whatsapp        VARCHAR(24)          NULL,
  phone_verified  TINYINT(1)      NOT NULL DEFAULT 0,
  email_verified  TINYINT(1)      NOT NULL DEFAULT 0,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                           ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Only the SHA-256 of each session token is stored, so a database leak does
-- not hand an attacker a set of live sessions.
CREATE TABLE IF NOT EXISTS user_sessions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  token_hash   CHAR(64)        NOT NULL,
  user_agent   VARCHAR(255)         NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME        NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id, expires_at),
  KEY idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64)        NOT NULL,
  expires_at  DATETIME        NOT NULL,
  used_at     DATETIME             NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resets_token (token_hash),
  KEY idx_resets_user (user_id),
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Phase 2: admin users and roles
-- ---------------------------------------------------------------------------

-- Replaces the single shared ADMIN_PASSWORD. Roles are deliberately just two:
--   owner — everything, including managing other admins
--   staff — the order queue only
-- More levels can be added when a real need appears; inventing them now would
-- only be guesswork encoded in an ENUM.
CREATE TABLE IF NOT EXISTS admin_users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(160)    NOT NULL,
  email          VARCHAR(190)    NOT NULL,
  password_hash  VARCHAR(255)    NOT NULL,
  role           ENUM('owner','staff') NOT NULL DEFAULT 'staff',
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,
  last_login_at  DATETIME             NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id  BIGINT UNSIGNED NOT NULL,
  token_hash     CHAR(64)        NOT NULL,
  user_agent     VARCHAR(255)         NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME        NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_sessions_token (token_hash),
  KEY idx_admin_sessions_user (admin_user_id, expires_at),
  CONSTRAINT fk_admin_sessions_user FOREIGN KEY (admin_user_id)
    REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_password_resets (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id  BIGINT UNSIGNED NOT NULL,
  token_hash     CHAR(64)        NOT NULL,
  expires_at     DATETIME        NOT NULL,
  used_at        DATETIME             NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_resets_token (token_hash),
  KEY idx_admin_resets_user (admin_user_id),
  CONSTRAINT fk_admin_resets_user FOREIGN KEY (admin_user_id)
    REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Phase 3: bulk orders
-- ---------------------------------------------------------------------------

-- One row per banknote. An order is now the parent — one customer, one
-- payment, one parcel — and every order has at least one item, including the
-- single-note orders that predate this table (migrate.mjs backfills them).
--
-- Availability is per item, not per order: finding four dates out of five
-- should not cost the customer the other four. The order's price_paise is the
-- sum of the available items' prices, recomputed whenever an item changes.
CREATE TABLE IF NOT EXISTS order_items (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id          BIGINT UNSIGNED NOT NULL,
  -- Preserves the order the customer typed the dates in.
  position          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  note_date         DATE            NOT NULL,
  display_date      VARCHAR(10)     NOT NULL,
  requested_denomination SMALLINT UNSIGNED NULL,
  gift_relationship VARCHAR(40)          NULL,
  gift_for          VARCHAR(160)         NULL,
  availability      ENUM('pending','available','unavailable')
                                    NOT NULL DEFAULT 'pending',
  -- Set by the admin when they confirm this note. Null until then.
  price_paise       INT UNSIGNED         NULL,
  note_denomination VARCHAR(120)         NULL,
  note_condition    VARCHAR(60)          NULL,
  note_serial       VARCHAR(60)          NULL,
  note_country      VARCHAR(80)          NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_order (order_id, position),
  KEY idx_items_date (note_date),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
