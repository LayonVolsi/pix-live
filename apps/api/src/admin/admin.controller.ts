import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service.js';
import { DemoTokenGuard } from './demo-token.guard.js';

/**
 * Rotas administrativas de demonstração — SEPARADAS da rota pública de webhook.
 * Protegidas por demo-token (não-secreto) e com rate-limit mais agressivo que o
 * webhook público (alvo óbvio de bot). Diferente do webhook, PODEM devolver o
 * veredito (é a affordance de demo para a UI, não a resposta ao provedor).
 */
@UseGuards(DemoTokenGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('orders/:publicRef/simulate')
  @HttpCode(200)
  async simulate(@Param('publicRef') publicRef: string): Promise<{ verdict: string }> {
    const outcome = await this.admin.simulate(publicRef);
    return { verdict: outcome.verdict };
  }

  @Post('webhook-events/:id/replay')
  @HttpCode(200)
  async replay(@Param('id') id: string): Promise<{ verdict: string }> {
    const outcome = await this.admin.replay(id);
    return { verdict: outcome.verdict };
  }
}
