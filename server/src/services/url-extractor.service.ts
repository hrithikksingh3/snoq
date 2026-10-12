import axios from 'axios';
import * as cheerio from 'cheerio';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export type Extraction = { status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; title?: string; description?: string; author?: string; sourcePlatform?: string; canonicalUrl?: string; faviconUrl?: string; thumbnailUrl?: string; text?: string };

const blockedHostnames = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);
const inputError = (message: string) => Object.assign(new Error(message), { status: 400 });

export function normalizeUrl(raw: string) {
  const url = new URL(raw);
  url.hash = '';
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(key => url.searchParams.delete(key));
  if (url.pathname === '/' && !url.search) url.pathname = '';
  return url.toString().replace(/\/$/, '');
}

export function privateAddress(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168)) || a >= 224;
  }
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd')
    || normalized.startsWith('fe80') || normalized.startsWith('::ffff:');
}

export async function assertPublicHttpUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw inputError('Enter a valid HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw inputError('Only HTTP(S) URLs are permitted');
  if (url.username || url.password) throw inputError('URLs with credentials are not permitted');
  if (url.port && !['80', '443'].includes(url.port)) throw inputError('Only standard HTTP(S) ports are permitted');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (blockedHostnames.has(hostname) || privateAddress(hostname)) throw inputError('Private URLs are not permitted');
  let resolved: Array<{ address: string; family: number }>;
  try { resolved = await lookup(hostname, { all: true, verbatim: true }) as Array<{ address: string; family: number }>; } catch { throw inputError('The URL host could not be resolved'); }
  if (!resolved.length || resolved.some(record => privateAddress(record.address))) throw inputError('Private URLs are not permitted');
  return url;
}

function safeLookup(hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address?: string, family?: number) => void) {
  void lookup(hostname, { all: true, verbatim: true }).then(records => {
    const selected = records.find(record => !privateAddress(record.address));
    if (!selected || records.some(record => privateAddress(record.address))) {
      callback(Object.assign(new Error('Private network targets are not permitted'), { code: 'EACCES' }));
      return;
    }
    callback(null, selected.address, selected.family);
  }).catch(() => callback(Object.assign(new Error('Unable to resolve URL host'), { code: 'ENOTFOUND' })));
}

const httpAgent = new http.Agent({ lookup: safeLookup as never });
const httpsAgent = new https.Agent({ lookup: safeLookup as never });

function safeAbsoluteUrl(value: string | undefined, base: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return undefined;
    return url.toString();
  } catch { return undefined; }
}

function sourcePlatform(raw: string) {
  try { return new URL(raw).hostname.replace(/^www\./, ''); } catch { return undefined; }
}

export async function extractUrl(raw: string): Promise<Extraction> {
  try {
    await assertPublicHttpUrl(raw);
    let current = raw;
    for (let redirects = 0; redirects < 4; redirects += 1) {
      const response = await axios.get<string>(current, { timeout: 10_000, maxContentLength: 1_500_000, maxBodyLength: 1_500_000, maxRedirects: 0, responseType: 'text', validateStatus: status => status >= 200 && status < 400, headers: { 'User-Agent': 'SNOQPreviewBot/1.0' }, httpAgent, httpsAgent });
      if (response.status >= 300) {
        const next = safeAbsoluteUrl(response.headers.location, current);
        if (!next) throw inputError('The redirect target is not a permitted HTTP(S) URL');
        await assertPublicHttpUrl(next);
        current = next;
        continue;
      }
      const $ = cheerio.load(response.data);
      const get = (selector: string, attribute = 'content') => $(selector).attr(attribute)?.trim();
      const title = get('meta[property="og:title"]') || $('title').text().trim();
      const description = get('meta[property="og:description"]') || get('meta[name="description"]');
      const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 12_000);
      return { status: text ? 'SUCCESS' : 'PARTIAL', title: title?.slice(0, 300), description: description?.slice(0, 1000), author: get('meta[name="author"]') || get('meta[property="article:author"]'), sourcePlatform: sourcePlatform(current), canonicalUrl: safeAbsoluteUrl(get('link[rel="canonical"]', 'href'), current) ?? current, faviconUrl: safeAbsoluteUrl(get('link[rel~="icon"]', 'href'), current), thumbnailUrl: safeAbsoluteUrl(get('meta[property="og:image"]'), current), text };
    }
    throw inputError('Too many redirects');
  } catch {
    return { status: 'FAILED', sourcePlatform: sourcePlatform(raw) };
  }
}
