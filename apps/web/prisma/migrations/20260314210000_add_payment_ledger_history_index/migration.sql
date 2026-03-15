CREATE INDEX "payment_ledger_sender_address_created_at_id_idx"
ON "payment_ledger"("sender_address", "created_at" DESC, "id" DESC);
