import { describe, expect, it } from 'vitest';
import { buildVaultExcel, buildVaultPdf, type VaultExportData } from './vault-export.service.js';

const data: VaultExportData = {
  owner: { email: 'owner@example.com', name: 'SNOQ Owner' },
  title: 'Research collection',
  description: 'A focused set of useful research resources.',
  generatedAt: new Date('2026-09-18T10:00:00.000Z'),
  scope: 'List',
  resourceTotal: 1,
  resourceCount: 1,
  isTruncated: false,
  resources: [{
    title: 'Example resource', description: 'A useful example.', url: 'https://example.com', resourceType: 'Website', sourcePlatform: 'Example',
    isFavorite: true, archivedAt: null, createdAt: new Date('2026-09-17T10:00:00.000Z'),
    categories: [{ category: { name: 'Research' } }], tags: [{ tag: { name: 'example' } }],
  }],
};

describe('vault export renderers', () => {
  it('creates a valid PDF report buffer', async () => {
    const report = await buildVaultPdf(data);
    expect(report.subarray(0, 4).toString()).toBe('%PDF');
    expect(report.length).toBeGreaterThan(1_000);
  });

  it('creates a valid empty-state PDF report', async () => {
    const report = await buildVaultPdf({
      ...data,
      resourceTotal: 0,
      resourceCount: 0,
      resources: [],
    });
    expect(report.subarray(0, 4).toString()).toBe('%PDF');
    expect(report.length).toBeGreaterThan(1_000);
  });

  it('creates a valid Excel workbook buffer', async () => {
    const workbook = await buildVaultExcel(data);
    expect(workbook.subarray(0, 2).toString()).toBe('PK');
    expect(workbook.length).toBeGreaterThan(1_000);
  });
});
