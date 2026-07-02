import { Controller, Get } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service.js';
import type { PanelView } from './reconciliation.service.js';

/**
 * Painel de conciliação — PÚBLICO por design (só leitura). As ações de escrita
 * (simular/replay) vivem nas rotas /admin separadas. E-mail já vem mascarado do
 * service (backend), nunca cru.
 */
@Controller({ path: 'reconciliation', version: '1' })
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  panel(): Promise<PanelView> {
    return this.reconciliation.panel();
  }
}
