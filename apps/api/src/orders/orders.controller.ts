import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service.js';
import type { OrderView } from './orders.service.js';

/**
 * Loja de um produto só. POST cria o pedido + cobrança Pix; GET consulta o status
 * por referência pública (o polling curto da página de pagamento bate aqui).
 */
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(): Promise<OrderView> {
    return this.orders.create();
  }

  @Get(':publicRef')
  get(@Param('publicRef') publicRef: string): Promise<OrderView> {
    return this.orders.getByRef(publicRef);
  }
}
