-- AlterTable
ALTER TABLE "webhook_events" ALTER COLUMN "signature_header" SET DATA TYPE TEXT,
ALTER COLUMN "request_id_header" SET DATA TYPE TEXT,
ALTER COLUMN "ts_from_signature" SET DATA TYPE TEXT,
ALTER COLUMN "mp_payment_id" SET DATA TYPE TEXT;
