-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'RENAMED', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerSource" AS ENUM ('SEND_CONFIRM', 'CONTRACT_EVENT');

-- CreateTable
CREATE TABLE "x_user" (
    "x_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "profile_picture" TEXT,
    "is_blue_verified" BOOLEAN NOT NULL DEFAULT false,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "derivation_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "x_user_pkey" PRIMARY KEY ("x_user_id")
);

-- CreateTable
CREATE TABLE "payment_quote" (
    "id" TEXT NOT NULL,
    "sender_address" TEXT NOT NULL,
    "x_user_id" TEXT NOT NULL,
    "username_at_quote" TEXT NOT NULL,
    "derivation_version" INTEGER NOT NULL,
    "vault_address" TEXT NOT NULL,
    "coin_type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "hmac_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_ledger" (
    "id" TEXT NOT NULL,
    "ledger_source" "LedgerSource" NOT NULL,
    "tx_digest" TEXT NOT NULL,
    "source_index" INTEGER NOT NULL,
    "sender_address" TEXT NOT NULL,
    "x_user_id" TEXT NOT NULL,
    "vault_address" TEXT NOT NULL,
    "coin_type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_quote_sender_address_status_idx" ON "payment_quote"("sender_address", "status");

-- CreateIndex
CREATE INDEX "payment_quote_x_user_id_idx" ON "payment_quote"("x_user_id");

-- CreateIndex
CREATE INDEX "payment_quote_expires_at_idx" ON "payment_quote"("expires_at");

-- CreateIndex
CREATE INDEX "payment_ledger_sender_address_idx" ON "payment_ledger"("sender_address");

-- CreateIndex
CREATE INDEX "payment_ledger_x_user_id_idx" ON "payment_ledger"("x_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_ledger_ledger_source_tx_digest_source_index_key" ON "payment_ledger"("ledger_source", "tx_digest", "source_index");

-- AddForeignKey
ALTER TABLE "payment_quote" ADD CONSTRAINT "payment_quote_x_user_id_fkey" FOREIGN KEY ("x_user_id") REFERENCES "x_user"("x_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_ledger" ADD CONSTRAINT "payment_ledger_x_user_id_fkey" FOREIGN KEY ("x_user_id") REFERENCES "x_user"("x_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
