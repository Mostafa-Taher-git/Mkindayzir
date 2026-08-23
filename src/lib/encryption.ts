import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

let cachedKey: Buffer | null = null;

export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const hexKey = process.env.ENCRYPTION_KEY;

  if (!hexKey) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  if (hexKey.length !== KEY_LENGTH * 2) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`
    );
  }

  cachedKey = Buffer.from(hexKey, "hex");
  return cachedKey;
}

export function encrypt(text: string, key: Buffer): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    const derivedKey = crypto.pbkdf2Sync(key, salt, 100_000, KEY_LENGTH, "sha256");

    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    cipher.setAAD(Buffer.from("mkindayzir-ai-key"));

    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const parts = [
      salt.toString("base64"),
      iv.toString("base64"),
      encrypted.toString("base64"),
      authTag.toString("base64"),
    ];

    return parts.join(".");
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Failed to encrypt data");
  }
}

export function decrypt(encrypted: string, key: Buffer): string {
  try {
    const parts = encrypted.split(".");

    if (parts.length !== 4) {
      throw new Error("Invalid encrypted data format");
    }

    const [saltB64, ivB64, encryptedB64, authTagB64] = parts;

    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const encryptedData = Buffer.from(encryptedB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");

    const derivedKey = crypto.pbkdf2Sync(key, salt, 100_000, KEY_LENGTH, "sha256");

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from("mkindayzir-ai-key"));

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Failed to decrypt data");
  }
}
