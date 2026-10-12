import path from 'node:path';

type UploadFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

const documentMimeByExtension: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.txt': ['text/plain'],
  '.md': ['text/markdown', 'text/plain'],
  '.json': ['application/json', 'text/json'],
  '.csv': ['text/csv', 'application/csv'],
  '.html': ['text/html'],
  '.htm': ['text/html'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

function startsWith(buffer: Buffer, value: number[]) {
  return buffer.length >= value.length && value.every((byte, index) => buffer[index] === byte);
}

function looksLikeText(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192));
  return !sample.includes(0);
}

function hasDocumentSignature(extension: string, buffer: Buffer) {
  if (extension === '.pdf') return startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (extension === '.docx') return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]);
  if (['.txt', '.md', '.json', '.csv', '.html', '.htm'].includes(extension)) return looksLikeText(buffer);
  return false;
}

export function validateDocumentUpload(file: UploadFile) {
  const extension = path.extname(file.originalname).toLowerCase();
  const acceptedMimeTypes = documentMimeByExtension[extension];
  if (!acceptedMimeTypes || !acceptedMimeTypes.includes(file.mimetype.toLowerCase())) {
    throw Object.assign(new Error('The document type does not match its filename'), { status: 415 });
  }
  if (!hasDocumentSignature(extension, file.buffer)) {
    throw Object.assign(new Error('The uploaded document does not match the declared file type'), { status: 415 });
  }
}

export function validateAvatarUpload(file: UploadFile) {
  const type = file.mimetype.toLowerCase();
  const valid = (type === 'image/jpeg' && startsWith(file.buffer, [0xff, 0xd8, 0xff]))
    || (type === 'image/png' && startsWith(file.buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || (type === 'image/webp' && startsWith(file.buffer, [0x52, 0x49, 0x46, 0x46]) && file.buffer.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!valid) throw Object.assign(new Error('The uploaded image does not match the declared file type'), { status: 415 });
}
