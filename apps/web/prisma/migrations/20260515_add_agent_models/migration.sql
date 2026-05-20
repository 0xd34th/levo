-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'PAUSED_BY_USER', 'DESTROYED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'BLOCKED_BY_SEAL');

-- CreateEnum
CREATE TYPE "ActionTrigger" AS ENUM ('CHAT', 'SCHEDULED', 'EVENT');

-- CreateTable
CREATE TABLE "agent_mandate" (
    "id" TEXT NOT NULL,
    "x_user_id" TEXT NOT NULL,
    "mandate_object_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actions" INTEGER NOT NULL,
    "coin_limits" JSONB NOT NULL,
    "period_ms" BIGINT NOT NULL,
    "allowed_targets" JSONB NOT NULL,
    "expiry_ms" BIGINT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "MandateStatus" NOT NULL DEFAULT 'ACTIVE',
    "nonce" BIGINT NOT NULL DEFAULT 0,
    "witness_commit" TEXT,
    "created_tx_digest" TEXT NOT NULL,
    "init_tx_digest" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_tx_digest" TEXT,
    "revoked_at" TIMESTAMP(3),
    "destroyed_tx_digest" TEXT,
    "destroyed_at" TIMESTAMP(3),

    CONSTRAINT "agent_mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_action" (
    "id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "x_user_id" TEXT NOT NULL,
    "action_type" INTEGER NOT NULL,
    "coin_type" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" "ActionStatus" NOT NULL,
    "tx_digest" TEXT,
    "trigger" "ActionTrigger" NOT NULL,
    "seal_approved" BOOLEAN NOT NULL,
    "error_reason" TEXT,
    "nonce_after" BIGINT,
    "commit_before" TEXT,
    "commit_after" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "agent_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_session" (
    "x_user_id" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_session_pkey" PRIMARY KEY ("x_user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_mandate_mandate_object_id_key" ON "agent_mandate"("mandate_object_id");

-- CreateIndex
CREATE INDEX "agent_mandate_x_user_id_status_idx" ON "agent_mandate"("x_user_id", "status");

-- CreateIndex
CREATE INDEX "agent_mandate_status_expiry_ms_idx" ON "agent_mandate"("status", "expiry_ms");

-- CreateIndex
CREATE INDEX "agent_action_x_user_id_created_at_idx" ON "agent_action"("x_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_action_mandate_id_created_at_idx" ON "agent_action"("mandate_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_action_status_created_at_idx" ON "agent_action"("status", "created_at");

-- AddForeignKey
ALTER TABLE "agent_mandate" ADD CONSTRAINT "agent_mandate_x_user_id_fkey" FOREIGN KEY ("x_user_id") REFERENCES "x_user"("x_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "agent_mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_x_user_id_fkey" FOREIGN KEY ("x_user_id") REFERENCES "x_user"("x_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_x_user_id_fkey" FOREIGN KEY ("x_user_id") REFERENCES "x_user"("x_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
