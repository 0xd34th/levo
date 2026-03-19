export function hasValidHmacSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.trim().length >= 32;
}
