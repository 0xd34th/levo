-- BYO agent runner model.

CREATE TYPE "UserAgentStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "AgentExecutionJobStatus" AS ENUM ('QUEUED', 'CLAIMED', 'CONFIRMED', 'FAILED', 'CANCELLED');

ALTER TYPE "MandateStatus" ADD VALUE IF NOT EXISTS 'LEGACY_PAUSED';

CREATE TABLE "user_agent" (
    "id" TEXT NOT NULL,
    "x_user_id" TEXT NOT NULL,
    "agent_address" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "UserAgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "runner_token_hash" TEXT,
    "runner_token_rotated_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_agent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_mandate"
ADD COLUMN "user_agent_id" TEXT,
ADD COLUMN "agent_address" TEXT NOT NULL DEFAULT '';

CREATE TABLE "agent_execution_job" (
    "id" TEXT NOT NULL,
    "user_agent_id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "witness_id" TEXT,
    "trigger" "ActionTrigger" NOT NULL,
    "status" "AgentExecutionJobStatus" NOT NULL DEFAULT 'QUEUED',
    "due_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "claim_expires_at" TIMESTAMP(3),
    "locked_by_token_hash" TEXT,
    "tx_digest" TEXT,
    "result" JSONB,
    "error_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_execution_job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_agent_runner_token_hash_key" ON "user_agent"("runner_token_hash");
CREATE UNIQUE INDEX "user_agent_x_user_id_agent_address_key" ON "user_agent"("x_user_id", "agent_address");
CREATE INDEX "user_agent_x_user_id_status_is_default_idx" ON "user_agent"("x_user_id", "status", "is_default");

CREATE INDEX "agent_mandate_user_agent_id_status_idx" ON "agent_mandate"("user_agent_id", "status");

CREATE UNIQUE INDEX "agent_execution_job_witness_id_key" ON "agent_execution_job"("witness_id");
CREATE INDEX "agent_execution_job_user_agent_id_status_due_at_idx" ON "agent_execution_job"("user_agent_id", "status", "due_at");
CREATE INDEX "agent_execution_job_mandate_id_status_idx" ON "agent_execution_job"("mandate_id", "status");
CREATE INDEX "agent_execution_job_status_due_at_idx" ON "agent_execution_job"("status", "due_at");

ALTER TABLE "user_agent"
ADD CONSTRAINT "user_agent_x_user_id_fkey"
FOREIGN KEY ("x_user_id") REFERENCES "x_user"("x_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_mandate"
ADD CONSTRAINT "agent_mandate_user_agent_id_fkey"
FOREIGN KEY ("user_agent_id") REFERENCES "user_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_execution_job"
ADD CONSTRAINT "agent_execution_job_user_agent_id_fkey"
FOREIGN KEY ("user_agent_id") REFERENCES "user_agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_execution_job"
ADD CONSTRAINT "agent_execution_job_mandate_id_fkey"
FOREIGN KEY ("mandate_id") REFERENCES "agent_mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_execution_job"
ADD CONSTRAINT "agent_execution_job_witness_id_fkey"
FOREIGN KEY ("witness_id") REFERENCES "agent_witness"("id") ON DELETE SET NULL ON UPDATE CASCADE;
