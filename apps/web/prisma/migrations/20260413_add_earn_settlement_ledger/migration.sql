ALTER TABLE "earn_accounting"
ADD COLUMN "reward_debt_payout_usdc" TEXT NOT NULL DEFAULT '0',
ADD COLUMN "reward_debt_retained_usdb" TEXT NOT NULL DEFAULT '0',
ADD COLUMN "claimed_usdc_total" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "retained_usdb_total" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "last_known_deposited_usdc" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "pending_earn"
ADD COLUMN "amount" TEXT;

CREATE TABLE "earn_global_state" (
    "stable_coin_type" TEXT NOT NULL,
    "acc_payout_per_share_usdc_e18" TEXT NOT NULL DEFAULT '0',
    "acc_retained_per_share_usdb_e18" TEXT NOT NULL DEFAULT '0',
    "last_harvest_tx_digest" TEXT,
    "last_harvested_reward_usdb" BIGINT NOT NULL DEFAULT 0,
    "last_harvested_payout_usdc" BIGINT NOT NULL DEFAULT 0,
    "last_harvested_retained_usdb" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earn_global_state_pkey" PRIMARY KEY ("stable_coin_type")
);

CREATE TABLE "pending_earn_settlement" (
    "id" TEXT NOT NULL,
    "x_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "stable_coin_type" TEXT NOT NULL,
    "preview_token" TEXT,
    "status" TEXT NOT NULL,
    "expected_yield_usdc" BIGINT NOT NULL DEFAULT 0,
    "expected_principal_usdc" BIGINT NOT NULL DEFAULT 0,
    "yield_tx_digest" TEXT,
    "yield_tx_bytes_base64" TEXT,
    "yield_signatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "principal_tx_digest" TEXT,
    "principal_tx_bytes_base64" TEXT,
    "principal_signatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settlement_snapshot" JSONB,
    "last_error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_earn_settlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pending_earn_settlement_x_user_id_fkey" FOREIGN KEY ("x_user_id") REFERENCES "x_user"("x_user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pending_earn_settlement_yield_tx_digest_key"
ON "pending_earn_settlement" ("yield_tx_digest");

CREATE UNIQUE INDEX "pending_earn_settlement_principal_tx_digest_key"
ON "pending_earn_settlement" ("principal_tx_digest");

CREATE INDEX "pending_earn_settlement_x_user_id_idx"
ON "pending_earn_settlement" ("x_user_id");

CREATE INDEX "pending_earn_settlement_status_idx"
ON "pending_earn_settlement" ("status");
