-- AlterTable
ALTER TABLE "x_user"
ADD COLUMN "privy_user_id" TEXT,
ADD COLUMN "privy_wallet_id" TEXT,
ADD COLUMN "sui_address" TEXT,
ADD COLUMN "sui_public_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "x_user_privy_user_id_key" ON "x_user"("privy_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "x_user_privy_wallet_id_key" ON "x_user"("privy_wallet_id");
