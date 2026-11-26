const PLACEHOLDER_SECRETS = new Set([
  "inseguro",
  "your-secret-key-change-in-production",
]);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error("JWT_SECRET debe configurarse con al menos 32 caracteres");
  }
  return secret;
}

module.exports = { getJwtSecret };
