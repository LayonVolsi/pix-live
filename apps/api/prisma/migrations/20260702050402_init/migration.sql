-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('draft', 'pending', 'paid', 'rejected', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "webhook_verdict" AS ENUM ('processado', 'ts_suspeito', 'duplicata_ignorada', 'assinatura_invalida', 'pagamento_desconhecido', 'erro');

-- CreateEnum
CREATE TYPE "webhook_source" AS ENUM ('mercadopago', 'admin_replay');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "public_ref" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "order_status" NOT NULL DEFAULT 'draft',
    "payer_email" TEXT,
    "mp_payment_id" TEXT,
    "qr_emv" TEXT,
    "qr_png_base64" TEXT,
    "pix_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_idempotency_keys" (
    "key" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "provider_response_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "webhook_source" NOT NULL,
    "signature_header" VARCHAR(512),
    "request_id_header" VARCHAR(255),
    "ts_from_signature" VARCHAR(64),
    "signature_valid" BOOLEAN NOT NULL,
    "verdict" "webhook_verdict" NOT NULL,
    "mp_payment_id" VARCHAR(255),
    "related_order_id" UUID,
    "processing_ms" INTEGER NOT NULL,
    "raw_body" TEXT,
    "error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_credits" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "mp_payment_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "credited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "orders_public_ref_key" ON "orders"("public_ref");

-- CreateIndex
CREATE UNIQUE INDEX "orders_mp_payment_id_key" ON "orders"("mp_payment_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_idempotency_keys_order_id_key" ON "outbound_idempotency_keys"("order_id");

-- CreateIndex
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_source_request_id_header_key" ON "webhook_events"("source", "request_id_header");

-- CreateIndex
CREATE UNIQUE INDEX "order_credits_order_id_key" ON "order_credits"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_credits_mp_payment_id_key" ON "order_credits"("mp_payment_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_idempotency_keys" ADD CONSTRAINT "outbound_idempotency_keys_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_related_order_id_fkey" FOREIGN KEY ("related_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_credits" ADD CONSTRAINT "order_credits_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
