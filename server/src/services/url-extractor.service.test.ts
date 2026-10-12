import { describe, expect, it } from 'vitest';
import { assertPublicHttpUrl, normalizeUrl } from './url-extractor.service.js';

describe('URL extraction safeguards', () => {
  it('removes tracking parameters and fragments', () => {
    expect(normalizeUrl('https://example.com/path?utm_source=x&keep=yes#heading')).toBe('https://example.com/path?keep=yes');
  });

  it.each(['http://127.0.0.1', 'http://10.0.0.5', 'http://[::1]', 'file:///etc/passwd', 'http://example.com:8080'])('rejects non-public target %s', async value => {
    await expect(assertPublicHttpUrl(value)).rejects.toThrow();
  });
});
