-- Update the existing shared vault's passcode from the bootstrap key to "230".
-- SHA-256("__spendsmart_open_vault__") = 0a30d5d31ac070c1bacdb334f772b9afc35bf76889e9a8d42a634d3643d23216
-- SHA-256("230")                       = a0eaec5a55dc2f5b2ba523018adc485ff620b9d83509b9f37186a7716e438d21
--
-- This updates the vault in-place so all existing spend_entries remain attached.
UPDATE vaults
SET passcode_hash = 'a0eaec5a55dc2f5b2ba523018adc485ff620b9d83509b9f37186a7716e438d21',
    updated_at    = now()
WHERE passcode_hash = '0a30d5d31ac070c1bacdb334f772b9afc35bf76889e9a8d42a634d3643d23216';
