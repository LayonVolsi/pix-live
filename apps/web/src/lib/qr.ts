/**
 * Sanity check barato do QR vindo da API: só base64 legítimo vira data-URI.
 * O valor é nosso (mesma origem), mas 1 regex elimina a classe inteira de URI
 * injetada se algum dia a fonte mudar.
 */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function qrDataUri(base64: string | null): string | null {
  if (base64 === null || base64.length === 0 || !BASE64_RE.test(base64)) {
    return null;
  }
  return `data:image/png;base64,${base64}`;
}
