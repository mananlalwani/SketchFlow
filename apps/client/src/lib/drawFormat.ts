/**
 * DrawApp Custom File Format (.dra)
 *
 * Format Structure:
 * - Magic bytes: "DRAWAPP1" (8 bytes)
 * - Version: 1 byte
 * - Salt: 16 bytes (for key derivation)
 * - IV: 12 bytes (for AES-GCM)
 * - Encrypted data: variable length (AES-256-GCM encrypted)
 *
 * The data is encrypted using AES-256-GCM with a key derived from
 * a combination of app secret + file-specific salt using PBKDF2.
 */

// Magic header to identify our format
const MAGIC_HEADER = new Uint8Array([0x44, 0x52, 0x41, 0x57, 0x41, 0x50, 0x50, 0x31]); // "DRAWAPP1"
const FORMAT_VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

// App secret - combined with salt for each file
const APP_SECRET = 'dra-v1-xK9mP2nQ7wL4jF8sY3hT6bV0cR5eZ1aU';

// Additional obfuscation layer
const OBFUSCATION_KEY = [0x4a, 0x7b, 0x2c, 0x9d, 0x1e, 0x5f, 0x8a, 0x3b];

function xorObfuscate(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ OBFUSCATION_KEY[i % OBFUSCATION_KEY.length];
  }
  return result;
}

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(APP_SECRET),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Encode project data to our custom .dra format
 */
export async function encodeDrawFormat(data: unknown): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();

  // Serialize and compress the data
  const jsonString = JSON.stringify(data);
  const jsonBytes = encoder.encode(jsonString);

  // Apply first layer of obfuscation
  const obfuscated = xorObfuscate(jsonBytes);

  // Generate cryptographic parameters
  const salt = generateSalt();
  const iv = generateIV();
  const key = await deriveKey(salt);

  // Encrypt the obfuscated data
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    obfuscated.buffer as ArrayBuffer,
  );

  // Build the final file
  const encryptedBytes = new Uint8Array(encrypted);
  const totalLength = MAGIC_HEADER.length + 1 + SALT_LENGTH + IV_LENGTH + encryptedBytes.length;
  const result = new Uint8Array(totalLength);

  let offset = 0;

  // Magic header
  result.set(MAGIC_HEADER, offset);
  offset += MAGIC_HEADER.length;

  // Version
  result[offset] = FORMAT_VERSION;
  offset += 1;

  // Salt
  result.set(salt, offset);
  offset += SALT_LENGTH;

  // IV
  result.set(iv, offset);
  offset += IV_LENGTH;

  // Encrypted data
  result.set(encryptedBytes, offset);

  return result.buffer;
}

/**
 * Decode our custom .dra format back to project data
 */
export async function decodeDrawFormat(buffer: ArrayBuffer): Promise<unknown> {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();

  let offset = 0;

  // Verify magic header
  const header = bytes.slice(offset, offset + MAGIC_HEADER.length);
  offset += MAGIC_HEADER.length;

  for (let i = 0; i < MAGIC_HEADER.length; i++) {
    if (header[i] !== MAGIC_HEADER[i]) {
      throw new Error('Invalid file format');
    }
  }

  // Check version
  const version = bytes[offset];
  offset += 1;

  if (version !== FORMAT_VERSION) {
    throw new Error('Unsupported file version');
  }

  // Extract salt
  const salt = bytes.slice(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  // Extract IV
  const iv = bytes.slice(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  // Extract encrypted data
  const encryptedData = bytes.slice(offset);

  // Derive key and decrypt
  const key = await deriveKey(salt);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      encryptedData.buffer as ArrayBuffer,
    );
  } catch {
    throw new Error('Failed to decrypt file - file may be corrupted');
  }

  // De-obfuscate
  const obfuscated = new Uint8Array(decrypted);
  const deobfuscated = xorObfuscate(obfuscated);

  // Parse JSON
  const jsonString = decoder.decode(deobfuscated);

  try {
    return JSON.parse(jsonString);
  } catch {
    throw new Error('Failed to parse file data');
  }
}

/**
 * Get the file extension for our format
 */
export const DRAW_FORMAT_EXTENSION = '.dra';

/**
 * Get the MIME type for our format
 */
export const DRAW_FORMAT_MIME = 'application/x-drawapp';

/**
 * Check if a file is in our format by checking the header
 */
export function isDrawFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < MAGIC_HEADER.length) {
    return false;
  }

  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < MAGIC_HEADER.length; i++) {
    if (bytes[i] !== MAGIC_HEADER[i]) {
      return false;
    }
  }

  return true;
}
