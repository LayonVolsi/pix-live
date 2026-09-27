// GERADO por scripts/gerar-trilha.mjs a partir do código real — não edite à mão.
// O CI roda `pnpm check:trilha` e reprova se este arquivo estiver desatualizado.

export const TRECHOS = {
  "assinatura_conferida": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "96-106",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L96-L106",
    "codigo": "const sig = verifySignature({\n  signatureHeader: input.signatureHeader ?? '',\n  requestId: input.requestId ?? '',\n  dataId: input.dataId ?? '',\n  secret,\n});\nif (!sig.valid || input.dataId === null) {\n  // Não persiste (anti-flood de anônimo); só loga e devolve 401 genérico.\n  this.logger.warn('Webhook rejeitado na Camada 1 (assinatura inválida) — sem I/O');\n  throw new UnauthorizedException('assinatura inválida');\n}"
  },
  "pedido_localizado": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "127-127",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L127-L127",
    "codigo": "const order = await this.prisma.order.findUnique({ where: { mpPaymentId: dataId } });"
  },
  "pedido_nao_localizado": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "127-127",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L127-L127",
    "codigo": "const order = await this.prisma.order.findUnique({ where: { mpPaymentId: dataId } });"
  },
  "aviso_repetido": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "136-140",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L136-L140",
    "codigo": "const requestIdAlreadyProcessed =\n  input.requestId !== null &&\n  (await this.prisma.webhookEvent.findFirst({\n    where: { source, requestIdHeader: input.requestId },\n  })) !== null;"
  },
  "credito_ja_existe": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "144-145",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L144-L145",
    "codigo": "const creditAlreadyExists =\n  (await this.prisma.orderCredit.findUnique({ where: { mpPaymentId: dataId } })) !== null;"
  },
  "provedor_consultado": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "185-185",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L185-L185",
    "codigo": "remote = await this.provider.getPayment(dataId);"
  },
  "provedor_nao_consultado": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "158-165",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L158-L165",
    "codigo": "if (\n  remoteLookupNeeded({\n    signatureValid: true,\n    requestIdAlreadyProcessed,\n    creditAlreadyExists,\n    tsWithinWindow,\n  })\n) {"
  },
  "valor_confere": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "266-273",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L266-L273",
    "codigo": "if (remote.amountCents !== order.amountCents) {\n  // Nunca loga o valor absoluto junto do id do pedido — só o fato.\n  return 'valor divergente';\n}\nif (remote.externalReference !== order.id) {\n  return 'referência externa divergente';\n}\nreturn null;"
  },
  "valor_divergente": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "266-273",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L266-L273",
    "codigo": "if (remote.amountCents !== order.amountCents) {\n  // Nunca loga o valor absoluto junto do id do pedido — só o fato.\n  return 'valor divergente';\n}\nif (remote.externalReference !== order.id) {\n  return 'referência externa divergente';\n}\nreturn null;"
  },
  "horario_suspeito": {
    "arquivo": "packages/core/src/idempotency.ts",
    "linhas": "38-45",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/packages/core/src/idempotency.ts#L38-L45",
    "codigo": "export function decideVerdict(e: WebhookEvaluation): Verdict {\n  if (!e.signatureValid) return 'assinatura_invalida';\n  if (e.requestIdAlreadyProcessed) return 'duplicata_ignorada';\n  if (e.creditAlreadyExists) return 'duplicata_ignorada';\n  if (!e.orderKnown) return 'pagamento_desconhecido';\n  if (!e.tsWithinWindow) return 'ts_suspeito';\n  return 'processado';\n}"
  },
  "credito_registrado": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "291-305",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L291-L305",
    "codigo": "try {\n  await this.prisma.$transaction(async (tx) => {\n    await tx.orderCredit.create({\n      data: { orderId: order.id, mpPaymentId, amountCents: order.amountCents },\n    });\n    await tx.order.update({\n      where: { id: order.id },\n      data: { status: 'paid', paidAt: new Date() },\n    });\n  });\n  return 'credited';\n} catch (error) {\n  if (this.isUniqueViolation(error)) return 'duplicate';\n  throw error;\n}"
  },
  "credito_bloqueado_pelo_banco": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "291-305",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L291-L305",
    "codigo": "try {\n  await this.prisma.$transaction(async (tx) => {\n    await tx.orderCredit.create({\n      data: { orderId: order.id, mpPaymentId, amountCents: order.amountCents },\n    });\n    await tx.order.update({\n      where: { id: order.id },\n      data: { status: 'paid', paidAt: new Date() },\n    });\n  });\n  return 'credited';\n} catch (error) {\n  if (this.isUniqueViolation(error)) return 'duplicate';\n  throw error;\n}"
  },
  "nao_creditei_de_novo": {
    "arquivo": "packages/core/src/idempotency.ts",
    "linhas": "38-45",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/packages/core/src/idempotency.ts#L38-L45",
    "codigo": "export function decideVerdict(e: WebhookEvaluation): Verdict {\n  if (!e.signatureValid) return 'assinatura_invalida';\n  if (e.requestIdAlreadyProcessed) return 'duplicata_ignorada';\n  if (e.creditAlreadyExists) return 'duplicata_ignorada';\n  if (!e.orderKnown) return 'pagamento_desconhecido';\n  if (!e.tsWithinWindow) return 'ts_suspeito';\n  return 'processado';\n}"
  },
  "sem_credito": {
    "arquivo": "packages/core/src/idempotency.ts",
    "linhas": "38-45",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/packages/core/src/idempotency.ts#L38-L45",
    "codigo": "export function decideVerdict(e: WebhookEvaluation): Verdict {\n  if (!e.signatureValid) return 'assinatura_invalida';\n  if (e.requestIdAlreadyProcessed) return 'duplicata_ignorada';\n  if (e.creditAlreadyExists) return 'duplicata_ignorada';\n  if (!e.orderKnown) return 'pagamento_desconhecido';\n  if (!e.tsWithinWindow) return 'ts_suspeito';\n  return 'processado';\n}"
  },
  "auditoria_gravada": {
    "arquivo": "apps/api/src/webhook/webhook.service.ts",
    "linhas": "332-345",
    "url": "https://github.com/LayonVolsi/pix-live/blob/main/apps/api/src/webhook/webhook.service.ts#L332-L345",
    "codigo": "await this.prisma.webhookEvent.create({\n  data: {\n    source,\n    signatureHeader: input.signatureHeader,\n    requestIdHeader: input.requestId,\n    tsFromSignature: ts,\n    signatureValid: true, // só eventos com assinatura válida chegam aqui\n    verdict,\n    mpPaymentId,\n    relatedOrderId,\n    processingMs,\n    rawBody: input.rawBody, // persistido só para assinatura válida (anti-flood)\n  },\n});"
  }
} as const;

export type PassoTrilha = keyof typeof TRECHOS;
