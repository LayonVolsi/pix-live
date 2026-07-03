/** Restante até a expiração, SEMPRE derivado do relógio — sem drift acumulado. */
export function msRestante(pixExpiresAtIso: string, agoraMs: number): number {
  return Math.max(0, new Date(pixExpiresAtIso).getTime() - agoraMs);
}

/** "mm:ss" com zero à esquerda (14:05); horas viram minutos corridos (75:00). */
export function rotuloRestante(ms: number): string {
  const totalSegundos = Math.floor(ms / 1000);
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}
