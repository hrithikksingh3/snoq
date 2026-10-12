import { describe, expect, it } from 'vitest';
import { validateAvatarUpload, validateDocumentUpload } from './upload-validation.service.js';

describe('upload validation', () => {
  it('accepts a PDF with a matching signature', () => {
    expect(() => validateDocumentUpload({ originalname: 'report.pdf', mimetype: 'application/pdf', size: 8, buffer: Buffer.from('%PDF-1.7') })).not.toThrow();
  });

  it('rejects a filename or MIME type that does not match the bytes', () => {
    expect(() => validateDocumentUpload({ originalname: 'report.pdf', mimetype: 'application/pdf', size: 12, buffer: Buffer.from('<script></script>') })).toThrow(/does not match/i);
  });

  it('rejects an image whose declared type does not match its signature', () => {
    expect(() => validateAvatarUpload({ originalname: 'avatar.png', mimetype: 'image/png', size: 3, buffer: Buffer.from([0xff, 0xd8, 0xff]) })).toThrow(/does not match/i);
  });
});
