import { useEffect, useState } from 'react';

/**
 * Relógio de 1s pro contador de expiração. Cada tick relê Date.now() — o
 * valor exibido deriva do relógio real, nunca de um acumulador (sem drift).
 * `ativo=false` desliga o intervalo (contador parado não gasta timer).
 */
export function useAgora(ativo: boolean): number {
  const [agora, setAgora] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!ativo) return undefined;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ativo]);

  return agora;
}
