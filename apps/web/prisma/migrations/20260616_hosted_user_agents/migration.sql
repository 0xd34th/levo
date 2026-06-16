CREATE TYPE "UserAgentCustodyMode" AS ENUM ('EXTERNAL_RUNNER', 'HOSTED');

ALTER TABLE "user_agent"
ADD COLUMN "custody_mode" "UserAgentCustodyMode" NOT NULL DEFAULT 'EXTERNAL_RUNNER',
ADD COLUMN "hosted_encrypted_seed" BYTEA,
ADD COLUMN "hosted_key_version" TEXT,
ADD COLUMN "hosted_provisioned_at" TIMESTAMP(3);

CREATE INDEX "user_agent_x_user_id_custody_mode_status_is_default_idx"
ON "user_agent"("x_user_id", "custody_mode", "status", "is_default");
