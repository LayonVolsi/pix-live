import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Filtro de exceção GLOBAL — contrato de erro problem+json (RFC 9457).
 *
 * Precisa ser registrado com `app.useGlobalFilters` (não `@UseFilters` num
 * controller) para também capturar erros de middleware (JSON malformado,
 * payload-too-large do body-parser) — ver laudo de segurança.
 *
 * Regra de ouro: NUNCA vazar stack/detalhe interno. Erro 5xx → detalhe genérico
 * na resposta, stack só no log server-side.
 */
interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
}

const TITLES: Readonly<Record<number, string>> = {
  400: 'Requisição inválida',
  401: 'Não autorizado',
  403: 'Proibido',
  404: 'Não encontrado',
  413: 'Payload grande demais',
  415: 'Tipo de mídia não suportado',
  429: 'Requisições demais',
  500: 'Erro interno',
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, detail } = this.describe(exception);

    if (status >= 500) {
      // Detalhe/stack só no log — nunca na resposta (5xx = erro interno).
      this.logger.error(
        `Erro não tratado em ${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: TITLES[status] ?? 'Erro',
      status,
      detail,
      instance: request.originalUrl,
    };

    response.status(status).setHeader('Content-Type', 'application/problem+json');
    response.send(JSON.stringify(problem));
  }

  private describe(exception: unknown): { status: number; detail: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // 5xx nunca ecoa mensagem (mesmo de HttpException): detalhe genérico, o
      // detalhe real vai só para o log. Defesa em profundidade (review, finding 4).
      if (status >= 500) return { status, detail: 'Erro interno.' };
      const res = exception.getResponse();
      const detail = typeof res === 'string' ? res : (this.messageOf(res) ?? exception.message);
      return { status, detail };
    }
    // Erros de middleware (body-parser: PayloadTooLargeError 413, JSON malformado
    // 400) carregam um `status`/`statusCode` numérico mas NÃO são HttpException.
    // Mapeamos pelo status e devolvemos detalhe GENÉRICO — não ecoar a mensagem
    // interna do parser (evita vazar detalhe de implementação).
    const status = this.statusOf(exception);
    if (status !== undefined && status >= 400 && status < 500) {
      return { status, detail: TITLES[status] ?? 'Requisição inválida' };
    }
    // Resto: erro interno inesperado.
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, detail: 'Erro interno.' };
  }

  /** Lê um status numérico de erros que não são HttpException (ex.: body-parser). */
  private statusOf(exception: unknown): number | undefined {
    if (typeof exception !== 'object' || exception === null) return undefined;
    const record = exception as { status?: unknown; statusCode?: unknown };
    const raw = typeof record.status === 'number' ? record.status : record.statusCode;
    return typeof raw === 'number' ? raw : undefined;
  }

  /** Extrai a mensagem de um corpo de HttpException sem vazar o objeto cru. */
  private messageOf(res: object): string | undefined {
    const message: unknown = (res as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) {
      return (message as unknown[]).filter((x): x is string => typeof x === 'string').join('; ');
    }
    return undefined;
  }
}
