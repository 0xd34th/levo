-- DB-scheduled mandates: on-chain artifacts become optional.
-- Legacy on-chain mandates keep their values; new DB mandates leave them NULL.
ALTER TABLE "agent_mandate" ALTER COLUMN "mandate_object_id" DROP NOT NULL;
ALTER TABLE "agent_mandate" ALTER COLUMN "created_tx_digest" DROP NOT NULL;

-- One-time Privy delegation consent: the app authorization key may sign agent
-- mandate actions on this user's embedded wallet autonomously (revocable).
ALTER TABLE "x_user" ADD COLUMN "agent_delegated_at" TIMESTAMP(3);
