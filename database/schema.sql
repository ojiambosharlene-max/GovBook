-- =====================================================================
--  Digital Government Appointment Management System
--  Database: government_appointment_system   (MySQL 8.0+)
--  Run this file FIRST in MySQL Workbench, then run seed.sql.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS government_appointment_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE government_appointment_system;

-- ---------- 1. roles ------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(30)  NOT NULL,
  description VARCHAR(200) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB;

-- ---------- 3. government_offices -----------------------------------
CREATE TABLE IF NOT EXISTS government_offices (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(20)  NOT NULL,
  name          VARCHAR(150) NOT NULL,
  address       VARCHAR(255) NOT NULL,
  city          VARCHAR(100) NOT NULL,
  phone         VARCHAR(30)  NULL,
  email         VARCHAR(150) NULL,
  opening_hours VARCHAR(150) NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_office_code (code)
) ENGINE=InnoDB;

-- ---------- 4. government_services ----------------------------------
CREATE TABLE IF NOT EXISTS government_services (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code              VARCHAR(20)  NOT NULL,
  name              VARCHAR(150) NOT NULL,
  category          VARCHAR(80)  NOT NULL,
  description       TEXT         NOT NULL,
  requirements      JSON         NULL COMMENT 'Array of documents/requirements the citizen must bring',
  processing_info   VARCHAR(200) NULL,
  icon              VARCHAR(40)  NOT NULL DEFAULT 'FileText',
  duration_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  requires_approval TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = bookings start as Pending until staff confirm',
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_code (code),
  KEY idx_service_category (category)
) ENGINE=InnoDB;

-- ---------- 5. office_services (which office offers which service) ---
CREATE TABLE IF NOT EXISTS office_services (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  office_id  INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_office_service (office_id, service_id),
  CONSTRAINT fk_os_office  FOREIGN KEY (office_id)  REFERENCES government_offices (id) ON DELETE CASCADE,
  CONSTRAINT fk_os_service FOREIGN KEY (service_id) REFERENCES government_services (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- 2. users (citizens, staff, administrators) --------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id        TINYINT UNSIGNED NOT NULL,
  office_id      INT UNSIGNED NULL COMMENT 'Staff only: the office the employee works at',
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(150) NOT NULL,
  phone          VARCHAR(25)  NOT NULL,
  national_id    VARCHAR(30)  NULL,
  password_hash  VARCHAR(100) NOT NULL,
  permissions    JSON         NULL COMMENT 'Staff only: extra permissions granted by an administrator',
  notify_email   TINYINT(1)   NOT NULL DEFAULT 1,
  notify_sms     TINYINT(1)   NOT NULL DEFAULT 0,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  token_version  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Bumped on password change / deactivation to invalidate old tokens',
  last_login_at  DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_national_id (national_id),
  KEY idx_users_role (role_id),
  KEY idx_users_office (office_id),
  CONSTRAINT fk_users_role   FOREIGN KEY (role_id)   REFERENCES roles (id),
  CONSTRAINT fk_users_office FOREIGN KEY (office_id) REFERENCES government_offices (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_token (token_hash),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- 6. appointment_schedules (one per office per day) -------
CREATE TABLE IF NOT EXISTS appointment_schedules (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  office_id     INT UNSIGNED NOT NULL,
  schedule_date DATE NOT NULL,
  open_time     TIME NOT NULL,
  close_time    TIME NOT NULL,
  slot_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  slot_capacity SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  is_closed     TINYINT(1) NOT NULL DEFAULT 0,
  closed_reason VARCHAR(200) NULL,
  created_by    INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedule_office_date (office_id, schedule_date),
  CONSTRAINT chk_schedule_times CHECK (close_time > open_time),
  CONSTRAINT fk_sched_office  FOREIGN KEY (office_id)  REFERENCES government_offices (id) ON DELETE CASCADE,
  CONSTRAINT fk_sched_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- 7. time_slots -------------------------------------------
-- booked_count can never exceed capacity (CHECK) - last line of defence against double booking.
CREATE TABLE IF NOT EXISTS time_slots (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id  INT UNSIGNED NOT NULL,
  office_id    INT UNSIGNED NOT NULL,
  slot_date    DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  capacity     SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  booked_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_slot_schedule_start (schedule_id, start_time),
  UNIQUE KEY uq_slot_id_office (id, office_id),
  KEY idx_slot_office_date (office_id, slot_date),
  CONSTRAINT chk_slot_capacity CHECK (booked_count <= capacity),
  CONSTRAINT chk_slot_times    CHECK (end_time > start_time),
  CONSTRAINT fk_slot_schedule FOREIGN KEY (schedule_id) REFERENCES appointment_schedules (id) ON DELETE CASCADE,
  CONSTRAINT fk_slot_office   FOREIGN KEY (office_id)   REFERENCES government_offices (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- 8. appointments -----------------------------------------
-- open_flag is 1 while the appointment is still "live" (Pending/Confirmed/Checked In/In Progress), NULL otherwise.
-- The unique keys on it stop a citizen holding the same slot twice or having two live bookings for one service.
-- The composite foreign keys guarantee the service is really offered by the office and the slot belongs to the office.
CREATE TABLE IF NOT EXISTS appointments (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference        VARCHAR(20) NOT NULL,
  citizen_id       INT UNSIGNED NOT NULL,
  office_id        INT UNSIGNED NOT NULL,
  service_id       INT UNSIGNED NOT NULL,
  slot_id          INT UNSIGNED NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  booked_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status           ENUM('Pending','Confirmed','Checked In','In Progress','Completed','Cancelled','No Show') NOT NULL DEFAULT 'Pending',
  notes            VARCHAR(500) NULL,
  cancel_reason    VARCHAR(300) NULL,
  cancelled_by     INT UNSIGNED NULL,
  cancelled_at     DATETIME NULL,
  completed_at     DATETIME NULL,
  idempotency_key  VARCHAR(64) NULL,
  open_flag        TINYINT GENERATED ALWAYS AS (CASE WHEN status IN ('Pending','Confirmed','Checked In','In Progress') THEN 1 ELSE NULL END) STORED,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_appt_reference (reference),
  UNIQUE KEY uq_appt_idempotency (citizen_id, idempotency_key),
  UNIQUE KEY uq_appt_citizen_slot_open (citizen_id, slot_id, open_flag),
  UNIQUE KEY uq_appt_citizen_service_open (citizen_id, service_id, open_flag),
  KEY idx_appt_office_date (office_id, appointment_date, appointment_time),
  KEY idx_appt_citizen (citizen_id, appointment_date),
  KEY idx_appt_status (status),
  KEY idx_appt_slot (slot_id),
  CONSTRAINT fk_appt_citizen FOREIGN KEY (citizen_id) REFERENCES users (id),
  CONSTRAINT fk_appt_office_service FOREIGN KEY (office_id, service_id) REFERENCES office_services (office_id, service_id),
  CONSTRAINT fk_appt_slot_office FOREIGN KEY (slot_id, office_id) REFERENCES time_slots (id, office_id),
  CONSTRAINT fk_appt_service FOREIGN KEY (service_id) REFERENCES government_services (id),
  CONSTRAINT fk_appt_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- 9. notifications ----------------------------------------
-- channel/delivery_status let an e-mail or SMS worker pick up rows with delivery_status='pending' later.
CREATE TABLE IF NOT EXISTS notifications (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  appointment_id  INT UNSIGNED NULL,
  type            VARCHAR(40)  NOT NULL,
  title           VARCHAR(150) NOT NULL,
  message         VARCHAR(500) NOT NULL,
  channel         ENUM('in_app','email','sms') NOT NULL DEFAULT 'in_app',
  delivery_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'sent',
  is_read         TINYINT(1) NOT NULL DEFAULT 0,
  read_at         DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, channel, is_read, created_at),
  KEY idx_notif_delivery (channel, delivery_status),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_appt FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- 10. queue_records ---------------------------------------
CREATE TABLE IF NOT EXISTS queue_records (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id INT UNSIGNED NOT NULL,
  office_id      INT UNSIGNED NOT NULL,
  queue_date     DATE NOT NULL,
  queue_number   SMALLINT UNSIGNED NOT NULL,
  status         ENUM('Waiting','Serving','Completed','Skipped') NOT NULL DEFAULT 'Waiting',
  counter        VARCHAR(30) NULL,
  served_by      INT UNSIGNED NULL,
  checked_in_at  DATETIME NOT NULL,
  started_at     DATETIME NULL,
  completed_at   DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_queue_appointment (appointment_id),
  UNIQUE KEY uq_queue_office_day_number (office_id, queue_date, queue_number),
  KEY idx_queue_status (office_id, queue_date, status),
  CONSTRAINT fk_queue_appt   FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_queue_office FOREIGN KEY (office_id) REFERENCES government_offices (id) ON DELETE CASCADE,
  CONSTRAINT fk_queue_staff  FOREIGN KEY (served_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- 11. audit_logs ------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(60)  NOT NULL,
  entity_type VARCHAR(40)  NULL,
  entity_id   VARCHAR(40)  NULL,
  details     JSON NULL,
  ip_address  VARCHAR(45) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- extra: public contact form ------------------------------
CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(150) NOT NULL,
  subject    VARCHAR(150) NOT NULL,
  message    TEXT NOT NULL,
  is_handled TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contact_handled (is_handled, created_at)
) ENGINE=InnoDB;
