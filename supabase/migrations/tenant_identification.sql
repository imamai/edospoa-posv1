-- ============================================================================
-- EdosPoa — distinguish the platform owner's own account from paying tenants
-- Run this once in the Supabase SQL editor (same project as mpesa_billing.sql).
-- Additive/idempotent, safe to re-run.
-- ============================================================================

alter table clients add column if not exists is_platform_account boolean default false;

-- Flag the platform owner's own accounts, if they're already in your
-- database, so they're excluded from tenant counts/MRR immediately.
-- Add any further owner-operated locations to this list the same way.
update clients set is_platform_account = true
where id in ('client-1778569091064', 'client-1778762083419'); -- Mejason Media Production, EDOS Centre
