import { bech32m } from 'bech32';

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `0x${hex}` as `0x${string}`;
}

export function fastAddressToBytes32(address: string): `0x${string}` {
  const { prefix, words } = bech32m.decode(address, 90);
  if (prefix !== 'fast') {
    throw new Error(`Fast address must use the "fast" prefix. Got: "${prefix}"`);
  }

  const bytes = new Uint8Array(bech32m.fromWords(words));
  if (bytes.length !== 32) {
    throw new Error(`Fast address must decode to 32 bytes. Got: ${bytes.length}`);
  }

  return bytesToHex(bytes);
}
