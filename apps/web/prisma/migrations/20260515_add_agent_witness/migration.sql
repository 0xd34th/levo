-- CreateTable
CREATE TABLE "agent_witness" (
    "id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "chain_index" INTEGER NOT NULL,
    "action_type" INTEGER NOT NULL,
    "coin_type" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "current_commit" TEXT NOT NULL,
    "next_commit" TEXT NOT NULL,
    "approval_identity" TEXT NOT NULL,
    "encrypted_object" BYTEA NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "consumed_at" TIMESTAMP(3),
    "consumed_tx_digest" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_witness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_witness_mandate_id_chain_index_key" ON "agent_witness"("mandate_id", "chain_index");

-- CreateIndex
CREATE INDEX "agent_witness_mandate_id_consumed_chain_index_idx" ON "agent_witness"("mandate_id", "consumed", "chain_index");

-- AddForeignKey
ALTER TABLE "agent_witness" ADD CONSTRAINT "agent_witness_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "agent_mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
