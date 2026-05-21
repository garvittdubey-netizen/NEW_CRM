-- Add SUPER_ADMIN to Role enum. Adds the value first; existing rows
-- (ADMIN / AGENT) are unaffected. Promotion of the earliest user is
-- handled by the application seed (scripts/seed.ts) so it remains
-- idempotent and runs on every boot.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
