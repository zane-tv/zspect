export async function binaryToArrayBuffer(input: unknown): Promise<ArrayBuffer> {
  if (!input) return new ArrayBuffer(0);
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  }
  if (typeof (input as Blob).arrayBuffer === 'function') {
    return (input as Blob).arrayBuffer();
  }
  if (typeof FileReader !== 'undefined' && input instanceof Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(input);
    });
  }
  // Fallback for structured-cloned Blob-like objects in test environments (fake-indexeddb + happy-dom)
  const record = input as Record<string, unknown>;
  for (const val of Object.values(record)) {
    if (val instanceof Uint8Array || ArrayBuffer.isView(val)) {
      return val.buffer.slice(val.byteOffset, val.byteOffset + val.byteLength) as ArrayBuffer;
    }
    if (Array.isArray(val) && val[0] instanceof Uint8Array) {
      const u8 = val[0] as Uint8Array;
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
    }
  }
  const symKeys = Object.getOwnPropertySymbols(record);
  for (const sym of symKeys) {
    const symVal = (record as Record<symbol, unknown>)[sym];
    if (symVal && typeof symVal === 'object') {
      const bufCandidate = (symVal as Record<string, unknown>)['buffer'];
      if (bufCandidate instanceof Uint8Array || Buffer.isBuffer(bufCandidate)) {
        return bufCandidate.buffer.slice(
          bufCandidate.byteOffset,
          bufCandidate.byteOffset + bufCandidate.byteLength,
        ) as ArrayBuffer;
      }
    }
  }
  return new Response(input as BodyInit).arrayBuffer();
}
