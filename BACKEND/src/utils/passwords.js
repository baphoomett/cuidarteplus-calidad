const {
  createHash,
  randomBytes,
  scrypt: scryptCallback,
  timingSafeEqual,
} = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(scryptCallback);
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const HASH_PATTERN = /^\$scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
const ENCODED_HASH_PREFIX = /^\$(?:2[aby]\$|argon2(?:id|i)?\$|scrypt\$)/;

async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES);
  return `$scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

function isPasswordHash(value) {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

async function verifyPassword(password, storedPassword) {
  if (typeof password !== "string" || typeof storedPassword !== "string") {
    return false;
  }

  const match = HASH_PATTERN.exec(storedPassword);
  if (!match) {
    if (ENCODED_HASH_PREFIX.test(storedPassword)) return false;
    const providedDigest = createHash("sha256").update(password).digest();
    const storedDigest = createHash("sha256").update(storedPassword).digest();
    return timingSafeEqual(providedDigest, storedDigest);
  }

  const salt = Buffer.from(match[1], "hex");
  const expectedKey = Buffer.from(match[2], "hex");
  const actualKey = await scrypt(password, salt, KEY_BYTES);
  return timingSafeEqual(actualKey, expectedKey);
}

module.exports = { hashPassword, isPasswordHash, verifyPassword };
