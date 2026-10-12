import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma.js';

const REPORT_ROW_LIMIT = 10_000;
const navy = '0F1D35';
const blue = '3158E5';
const mint = '79E5C0';
const slate = '60708A';

type ReportUser = {
  name: string | null;
  email: string;
  role: 'USER' | 'ADMIN';
  isSuspended: boolean;
  createdAt: Date;
  _count: { resources: number; subscriptions: number };
};

type ReportSubscription = {
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PENDING';
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  user: { name: string | null; email: string };
  plan: { name: string; priceInr: number; aiCredits: number };
};

type ReportCoupon = {
  code: string;
  discountPercent: number;
  active: boolean;
  validFrom: Date;
  validUntil: Date | null;
  maxRedemptions: number | null;
  grantDays: number | null;
  plan: { name: string } | null;
  _count: { redemptions: number };
};

export type AdminReportData = {
  generatedAt: Date;
  isTruncated: boolean;
  summary: {
    users: number;
    activeUsers: number;
    suspendedUsers: number;
    administrators: number;
    resources: number;
    plans: number;
    activeSubscriptions: number;
    activeCoupons: number;
    expiredCoupons: number;
    disabledCoupons: number;
  };
  users: ReportUser[];
  subscriptions: ReportSubscription[];
  coupons: ReportCoupon[];
};

const formatDate = (date: Date | null | undefined) => date ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date) : '—';
const formatDateTime = (date: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);

const subscriptionState = (subscription: ReportSubscription, now: Date) => subscription.status === 'ACTIVE' && subscription.endsAt > now ? 'Active' : subscription.status[0] + subscription.status.slice(1).toLowerCase();

const couponState = (coupon: ReportCoupon, now: Date) => {
  if (!coupon.active) return 'Disabled';
  if (coupon.validFrom > now) return 'Scheduled';
  if (coupon.validUntil && coupon.validUntil < now) return 'Expired';
  if (coupon.maxRedemptions !== null && coupon._count.redemptions >= coupon.maxRedemptions) return 'Redeemed';
  return 'Active';
};

export async function collectAdminReportData(): Promise<AdminReportData> {
  const now = new Date();
  const [
    users,
    subscriptions,
    coupons,
    userCount,
    activeUsers,
    suspendedUsers,
    administrators,
    resourceCount,
    planCount,
    activeSubscriptionCount,
  ] = await Promise.all([
    prisma.user.findMany({
      take: REPORT_ROW_LIMIT,
      orderBy: { createdAt: 'desc' },
      select: { name: true, email: true, role: true, isSuspended: true, createdAt: true, _count: { select: { resources: true, subscriptions: true } } },
    }),
    prisma.userSubscription.findMany({
      take: REPORT_ROW_LIMIT,
      orderBy: { createdAt: 'desc' },
      select: {
        status: true, startsAt: true, endsAt: true, createdAt: true,
        user: { select: { name: true, email: true } },
        plan: { select: { name: true, priceInr: true, aiCredits: true } },
      },
    }),
    prisma.coupon.findMany({
      take: REPORT_ROW_LIMIT,
      orderBy: { createdAt: 'desc' },
      select: {
        code: true, discountPercent: true, active: true, validFrom: true, validUntil: true,
        maxRedemptions: true, grantDays: true, plan: { select: { name: true } },
        _count: { select: { redemptions: true } },
      },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { isSuspended: false } }),
    prisma.user.count({ where: { isSuspended: true } }),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.resource.count(),
    prisma.subscriptionPlan.count(),
    prisma.userSubscription.count({ where: { status: 'ACTIVE', endsAt: { gt: now } } }),
  ]);

  const typedUsers = users as ReportUser[];
  const typedSubscriptions = subscriptions as ReportSubscription[];
  const typedCoupons = coupons as ReportCoupon[];
  const states = typedCoupons.map(coupon => couponState(coupon, now));

  return {
    generatedAt: now,
    isTruncated: userCount > REPORT_ROW_LIMIT || subscriptions.length === REPORT_ROW_LIMIT || coupons.length === REPORT_ROW_LIMIT,
    summary: {
      users: userCount,
      activeUsers,
      suspendedUsers,
      administrators,
      resources: resourceCount,
      plans: planCount,
      activeSubscriptions: activeSubscriptionCount,
      activeCoupons: states.filter(state => state === 'Active').length,
      expiredCoupons: states.filter(state => state === 'Expired').length,
      disabledCoupons: states.filter(state => state === 'Disabled').length,
    },
    users: typedUsers,
    subscriptions: typedSubscriptions,
    coupons: typedCoupons,
  };
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${navy}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF2D4265' } } };
  });
  row.height = 25;
}

function setColumns(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function addSheetTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string) {
  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${navy}` } };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 34;
  sheet.mergeCells('A2:H2');
  const sub = sheet.getCell('A2');
  sub.value = subtitle;
  sub.font = { italic: true, color: { argb: 'FF52657F' } };
  sheet.getRow(2).height = 22;
}

function addTable(sheet: ExcelJS.Worksheet, name: string, headers: string[], rows: Array<Array<string | number | Date | null>>) {
  const start = 4;
  headers.forEach((header, index) => { sheet.getCell(start, index + 1).value = header; });
  styleHeader(sheet.getRow(start));
  rows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => { sheet.getCell(start + rowIndex + 1, columnIndex + 1).value = value; });
  });
  if (rows.length) {
    sheet.addTable({
      name,
      ref: `A${start}`,
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: headers.map(header => ({ name: header })),
      rows: rows.map(row => row.map(value => value ?? '')),
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: start }];
}

export async function buildAdminWorkbook(data: AdminReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SNOQ';
  workbook.created = data.generatedAt;
  workbook.modified = data.generatedAt;

  const summary = workbook.addWorksheet('Overview', { views: [{ showGridLines: false }] });
  summary.mergeCells('A1:D1');
  const heading = summary.getCell('A1');
  heading.value = 'SNOQ ADMIN REPORT';
  heading.font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
  heading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${navy}` } };
  heading.alignment = { vertical: 'middle' };
  summary.getRow(1).height = 38;
  summary.mergeCells('A2:D2');
  summary.getCell('A2').value = `Generated ${formatDateTime(data.generatedAt)} · Private administrator export`;
  summary.getCell('A2').font = { color: { argb: 'FF52657F' }, italic: true };
  summary.getRow(2).height = 22;
  setColumns(summary, [28, 20, 28, 20]);
  const metrics = [
    ['Users', data.summary.users], ['Active users', data.summary.activeUsers],
    ['Suspended users', data.summary.suspendedUsers], ['Administrators', data.summary.administrators],
    ['Resources', data.summary.resources], ['Plans', data.summary.plans],
    ['Active subscriptions', data.summary.activeSubscriptions], ['Active coupons', data.summary.activeCoupons],
    ['Expired coupons', data.summary.expiredCoupons], ['Disabled coupons', data.summary.disabledCoupons],
  ];
  metrics.forEach(([label, value], index) => {
    const row = 4 + Math.floor(index / 2) * 2;
    const column = index % 2 === 0 ? 1 : 3;
    const labelCell = summary.getCell(row, column);
    const valueCell = summary.getCell(row + 1, column);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: `FF${slate}` } };
    valueCell.value = value as number;
    valueCell.font = { bold: true, size: 24, color: { argb: `FF${blue}` } };
    [labelCell, valueCell].forEach(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FF' } };
      cell.border = { top: { style: 'thin', color: { argb: 'FFD9E2F0' } }, bottom: { style: 'thin', color: { argb: 'FFD9E2F0' } }, left: { style: 'thin', color: { argb: 'FFD9E2F0' } }, right: { style: 'thin', color: { argb: 'FFD9E2F0' } } };
    });
  });
  summary.mergeCells('A16:D16');
  summary.getCell('A16').value = data.isTruncated ? `Detailed sheets are capped at ${REPORT_ROW_LIMIT.toLocaleString()} rows per category.` : 'Detailed user, subscription, and coupon records are available in the accompanying sheets.';
  summary.getCell('A16').font = { color: { argb: 'FF52657F' }, italic: true };

  const users = workbook.addWorksheet('Users');
  addSheetTitle(users, 'Users', `Generated ${formatDateTime(data.generatedAt)} · ${data.summary.users} total accounts`);
  addTable(users, 'UsersTable', ['Name', 'Email', 'Role', 'Status', 'Resources', 'Subscriptions', 'Joined'], data.users.map(user => [
    user.name ?? '—', user.email, user.role, user.isSuspended ? 'Suspended' : 'Active', user._count.resources, user._count.subscriptions, user.createdAt,
  ]));
  setColumns(users, [24, 36, 14, 15, 13, 16, 18]);
  users.getColumn(7).numFmt = 'dd mmm yyyy';

  const subscriptions = workbook.addWorksheet('Subscriptions');
  addSheetTitle(subscriptions, 'Subscriptions', `Generated ${formatDateTime(data.generatedAt)} · ${data.summary.activeSubscriptions} active subscriptions`);
  addTable(subscriptions, 'SubscriptionsTable', ['User', 'Email', 'Plan', 'Status', 'Price (INR)', 'AI credits', 'Starts', 'Ends'], data.subscriptions.map(subscription => [
    subscription.user.name ?? '—', subscription.user.email, subscription.plan.name, subscriptionState(subscription, data.generatedAt), subscription.plan.priceInr, subscription.plan.aiCredits, subscription.startsAt, subscription.endsAt,
  ]));
  setColumns(subscriptions, [24, 34, 18, 15, 16, 14, 18, 18]);
  subscriptions.getColumn(7).numFmt = 'dd mmm yyyy';
  subscriptions.getColumn(8).numFmt = 'dd mmm yyyy';

  const coupons = workbook.addWorksheet('Coupons');
  addSheetTitle(coupons, 'Coupons', `Generated ${formatDateTime(data.generatedAt)} · ${data.summary.activeCoupons} active offers`);
  addTable(coupons, 'CouponsTable', ['Code', 'Discount', 'Plan', 'Status', 'Redemptions', 'Limit', 'Valid from', 'Expires'], data.coupons.map(coupon => [
    coupon.code, `${coupon.discountPercent}%`, coupon.plan?.name ?? 'All plans', couponState(coupon, data.generatedAt), coupon._count.redemptions, coupon.maxRedemptions ?? 'Unlimited', coupon.validFrom, coupon.validUntil,
  ]));
  setColumns(coupons, [22, 14, 20, 15, 16, 14, 18, 18]);
  coupons.getColumn(7).numFmt = 'dd mmm yyyy';
  coupons.getColumn(8).numFmt = 'dd mmm yyyy';

  return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}

function drawMetric(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: number, width: number) {
  doc.roundedRect(x, y, width, 68, 8).fillAndStroke('#F4F7FD', '#D7E1F0');
  doc.fillColor('#60708A').fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), x + 12, y + 12, { width: width - 24 });
  doc.fillColor(`#${blue}`).fontSize(20).font('Helvetica-Bold').text(String(value), x + 12, y + 31, { width: width - 24 });
}

function drawTable(doc: PDFKit.PDFDocument, y: number, title: string, headers: string[], rows: string[][], widths: number[]) {
  const x = 40;
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  doc.fillColor(`#${navy}`).fontSize(13).font('Helvetica-Bold').text(title, x, y);
  let cursorY = y + 24;
  doc.rect(x, cursorY, totalWidth, 22).fill(`#${navy}`);
  let cursorX = x;
  doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold');
  headers.forEach((header, index) => { doc.text(header.toUpperCase(), cursorX + 6, cursorY + 7, { width: widths[index] - 12, ellipsis: true }); cursorX += widths[index]; });
  cursorY += 22;
  rows.forEach((row, rowIndex) => {
    if (cursorY > 500) return;
    doc.rect(x, cursorY, totalWidth, 22).fill(rowIndex % 2 ? '#F6F8FC' : '#FFFFFF');
    cursorX = x;
    doc.fillColor('#263A58').fontSize(7.5).font('Helvetica');
    row.forEach((value, index) => { doc.text(value, cursorX + 6, cursorY + 7, { width: widths[index] - 12, ellipsis: true, lineBreak: false }); cursorX += widths[index]; });
    cursorY += 22;
  });
  return cursorY;
}

function drawAdminDetailHeader(doc: PDFKit.PDFDocument, title: string, pageNumber: number) {
  doc.rect(0, 0, doc.page.width, 76).fill(`#${navy}`);
  doc.fillColor(`#${mint}`).fontSize(8).font('Helvetica-Bold').text('SNOQ CONTROL CENTER', 40, 23);
  doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold').text(title, 40, 37);
  doc.fillColor('#C5D1E5').fontSize(8).font('Helvetica').text('Private administrator export', 40, 59);
  doc.fillColor('#C5D1E5').fontSize(8).font('Helvetica-Bold').text(`PAGE ${pageNumber}`, 712, 33, { width: 90, align: 'right' });
}

function drawAdminDetailFooter(doc: PDFKit.PDFDocument, pageNumber: number) {
  const y = doc.page.height - 54;
  doc.moveTo(40, y - 8).lineTo(doc.page.width - 40, y - 8).strokeColor('#D9E2F0').lineWidth(0.8).stroke();
  doc.fillColor('#60708A').font('Helvetica').fontSize(7.5).text('SNOQ  |  Built by Codersvoice  |  linkedin.com/company/codersvoice', 40, y, { width: 500 });
  doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5).text(`Confidential - ${pageNumber}`, 620, y, { width: 180, align: 'right' });
}

function appendDetailedTable(doc: PDFKit.PDFDocument, title: string, headers: string[], rows: string[][], widths: number[]) {
  const x = 40;
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  let pageNumber = doc.bufferedPageRange().count + 1;
  const openPage = (continued = false) => {
    doc.addPage();
    drawAdminDetailHeader(doc, continued ? `${title} - continued` : title, pageNumber);
    drawAdminDetailFooter(doc, pageNumber);
    pageNumber += 1;
    const y = 101;
    doc.roundedRect(x, y, tableWidth, 24, 7).fill(`#${navy}`);
    let cursorX = x;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7);
    headers.forEach((header, index) => {
      doc.text(header.toUpperCase(), cursorX + 6, y + 8, { width: widths[index] - 12, ellipsis: true, lineBreak: false });
      cursorX += widths[index];
    });
    return y + 24;
  };

  let y = openPage();
  rows.forEach((row, rowIndex) => {
    const height = 24;
    if (y + height > doc.page.height - 50) y = openPage(true);
    doc.rect(x, y, tableWidth, height).fill(rowIndex % 2 ? '#F6F8FC' : '#FFFFFF').stroke('#E0E8F2');
    let cursorX = x;
    doc.fillColor('#263A58').font('Helvetica').fontSize(7.5);
    row.forEach((value, index) => {
      doc.text(value, cursorX + 6, y + 8, { width: widths[index] - 12, ellipsis: true, lineBreak: false });
      cursorX += widths[index];
    });
    y += height;
  });
  if (rows.length === 0) {
    doc.fillColor('#60708A').font('Helvetica-Oblique').fontSize(9).text('No records are available in this section.', x, y + 22, { width: tableWidth, align: 'center' });
  }
}

export function buildAdminPdf(data: AdminReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true, info: { Title: 'SNOQ Admin Report', Author: 'SNOQ' } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, doc.page.width, 92).fill(`#${navy}`);
    doc.fillColor(`#${mint}`).fontSize(10).font('Helvetica-Bold').text('SNOQ CONTROL CENTER', 40, 27);
    doc.fillColor('#FFFFFF').fontSize(26).font('Helvetica-Bold').text('Administrator report', 40, 44);
    doc.fillColor('#C5D1E5').fontSize(9).font('Helvetica').text(`Generated ${formatDateTime(data.generatedAt)} · Private and confidential`, 40, 75);

    const metricWidth = 142;
    const metricGap = 11;
    [
      ['Users', data.summary.users], ['Active users', data.summary.activeUsers], ['Suspended users', data.summary.suspendedUsers],
      ['Resources', data.summary.resources], ['Active subscriptions', data.summary.activeSubscriptions],
    ].forEach(([label, value], index) => drawMetric(doc, 40 + index * (metricWidth + metricGap), 116, label as string, value as number, metricWidth));

    let y = 214;
    y = drawTable(doc, y, 'Latest users', ['Name', 'Email', 'Role', 'Status', 'Resources', 'Joined'], data.users.slice(0, 6).map(user => [
      user.name ?? '—', user.email, user.role, user.isSuspended ? 'Suspended' : 'Active', String(user._count.resources), formatDate(user.createdAt),
    ]), [130, 220, 72, 84, 75, 90]);

    y += 22;
    drawTable(doc, y, 'Coupon status', ['Code', 'Offer', 'Plan', 'Status', 'Uses', 'Expires'], data.coupons.slice(0, 2).map(coupon => [
      coupon.code, `${coupon.discountPercent}% off`, coupon.plan?.name ?? 'All plans', couponState(coupon, data.generatedAt), `${coupon._count.redemptions}${coupon.maxRedemptions ? `/${coupon.maxRedemptions}` : ''}`, formatDate(coupon.validUntil),
    ]), [130, 110, 130, 100, 90, 120]);

    appendDetailedTable(doc, 'User records', ['Name', 'Email', 'Role', 'Status', 'Resources', 'Subscriptions', 'Joined'], data.users.map(user => [
      user.name ?? '—', user.email, user.role, user.isSuspended ? 'Suspended' : 'Active', String(user._count.resources), String(user._count.subscriptions), formatDate(user.createdAt),
    ]), [125, 210, 65, 80, 75, 85, 110]);
    appendDetailedTable(doc, 'Subscription records', ['User', 'Email', 'Plan', 'Status', 'Price', 'Credits', 'Starts', 'Ends'], data.subscriptions.map(subscription => [
      subscription.user.name ?? '—', subscription.user.email, subscription.plan.name, subscriptionState(subscription, data.generatedAt), `₹${subscription.plan.priceInr}`, String(subscription.plan.aiCredits), formatDate(subscription.startsAt), formatDate(subscription.endsAt),
    ]), [105, 170, 95, 72, 65, 68, 85, 85]);
    appendDetailedTable(doc, 'Coupon records', ['Code', 'Discount', 'Plan', 'Status', 'Redemptions', 'Limit', 'Valid from', 'Expires'], data.coupons.map(coupon => [
      coupon.code, `${coupon.discountPercent}%`, coupon.plan?.name ?? 'All plans', couponState(coupon, data.generatedAt), String(coupon._count.redemptions), coupon.maxRedemptions?.toString() ?? 'Unlimited', formatDate(coupon.validFrom), formatDate(coupon.validUntil),
    ]), [115, 75, 115, 95, 90, 80, 90, 90]);

    const pages = doc.bufferedPageRange();
    doc.switchToPage(pages.start);
    drawAdminDetailFooter(doc, 1);
    doc.end();
  });
}
