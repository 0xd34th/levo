-- Mark pre-BYO platform-agent mandates as legacy-paused after the enum value exists.
UPDATE "agent_mandate"
SET "status" = 'LEGACY_PAUSED'
WHERE "user_agent_id" IS NULL
  AND "status" = 'ACTIVE';
