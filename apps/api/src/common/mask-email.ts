/**
 * Mascara o e-mail do pagador para exibição pública. Mascaramento é do BACKEND,
 * nunca só via CSS/front — um visitante anônimo do painel jamais vê o e-mail cru.
 * `joao@gmail.com` → `jo**@gmail.com`.
 */
export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at);
  const visible = name.slice(0, Math.min(2, name.length));
  const hidden = '*'.repeat(Math.max(1, name.length - visible.length));
  return `${visible}${hidden}${domain}`;
}
