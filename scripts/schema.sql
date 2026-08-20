-- BirthNote schema. Safe to run repeatedly.

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
