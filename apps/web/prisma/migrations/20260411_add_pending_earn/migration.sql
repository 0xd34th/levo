CREATE TABLE "pending_earn" (
    "tx_digest" TEXT NOT NULL,
    "x_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tx_bytes_base64" TEXT NOT NULL,
    "signatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_earn_pkey" PRIMARY KEY ("tx_digest")
);

CREATE INDEX "pending_earn_x_user_id_idx" ON "pending_earn" ("x_user_id");
