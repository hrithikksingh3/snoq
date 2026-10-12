import { describe, expect, it } from 'vitest';
import { buildAdminPdf, buildAdminWorkbook, type AdminReportData } from './admin-report.service.js';

const report: AdminReportData = {
  generatedAt: new Date('2026-09-18T10:00:00.000Z'),
  isTruncated: false,
  summary: { users: 1, activeUsers: 1, suspendedUsers: 0, administrators: 1, resources: 2, plans: 4, activeSubscriptions: 1, activeCoupons: 1, expiredCoupons: 0, disabledCoupons: 0 },
  users: [{ name: 'Administrator', email: 'admin@example.com', role: 'ADMIN', isSuspended: false, createdAt: new Date('2026-09-01T10:00:00.000Z'), _count: { resources: 2, subscriptions: 1 } }],
  subscriptions: [{ status: 'ACTIVE', startsAt: new Date('2026-09-01T10:00:00.000Z'), endsAt: new Date('2026-10-01T10:00:00.000Z'), createdAt: new Date('2026-09-01T10:00:00.000Z'), user: { name: 'Administrator', email: 'admin@example.com' }, plan: { name: 'Pro', priceInr: 69, aiCredits: 120 } }],
  coupons: [{ code: 'WELCOME', discountPercent: 20, active: true, validFrom: new Date('2026-09-01T10:00:00.000Z'), validUntil: new Date('2026-10-01T10:00:00.000Z'), maxRedemptions: 100, grantDays: null, plan: null, _count: { redemptions: 1 } }],
};

describe('administrator report renderers', () => {
  it('creates a valid PDF report buffer', async () => {
    const pdf = await buildAdminPdf(report);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('creates a valid Excel report buffer', async () => {
    const workbook = await buildAdminWorkbook(report);
    expect(workbook.subarray(0, 2).toString()).toBe('PK');
  });
});
