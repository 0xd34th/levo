CREATE TABLE "earn_accounting" (
    "x_user_id" TEXT NOT NULL,
    "retained_account_id" TEXT,
    "last_settled_tx_digest" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earn_accounting_pkey" PRIMARY KEY ("x_user_id"),
    CONSTRAINT "earn_accounting_x_user_id_fkey" FOREIGN KEY ("x_user_id") REFERENCES "x_user"("x_user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "earn_accounting_retained_account_id_key"
ON "earn_accounting" ("retained_account_id");
