import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from './app.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('application security baseline', () => {
  it('exposes only a minimal public health response with security headers', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('rejects a cross-origin API write before it reaches an endpoint', async () => {
    const response = await fetch(`${baseUrl}/api/resources`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Request origin is not allowed' });
  });

  it('exposes only the public Google browser configuration needed by the login page', async () => {
    const response = await fetch(`${baseUrl}/api/auth/google/config`);
    expect(response.status).toBe(200);
    const config = await response.json() as { enabled: unknown; clientId: unknown };
    expect(typeof config.enabled).toBe('boolean');
    expect(config.clientId === null || typeof config.clientId === 'string').toBe(true);
  });
});
