-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('X_HANDLE', 'SUI_ADDRESS');

-- AlterTable
ALTER TABLE "payment_quote"
ADD COLUMN "recipient_type" "RecipientType" NOT NULL DEFAULT 'X_HANDLE',
ALTER COLUMN "x_user_id" DROP NOT NULL,
ALTER COLUMN "username_at_quote" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payment_ledger"
ADD COLUMN "recipient_type" "RecipientType" NOT NULL DEFAULT 'X_HANDLE',
ALTER COLUMN "x_user_id" DROP NOT NULL;
