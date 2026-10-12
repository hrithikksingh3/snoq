import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

const PDF_ITEM_LIMIT = 100;
const EXCEL_ITEM_LIMIT = 5_000;

export type ExportScope = { kind: 'VAULT' } | { kind: 'LIST'; listId: string };

type ExportResource = {
  title: string;
  description: string | null;
  url: string | null;
  resourceType: string;
  sourcePlatform: string | null;
  isFavorite: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  categories: Array<{ category: { name: string } }>;
  tags: Array<{ tag: { name: string } }>;
};

export type VaultExportData = {
  owner: { email: string; name: string | null };
  title: string;
  description: string;
  generatedAt: Date;
  scope: 'Entire vault' | 'List';
  resourceTotal: number;
  resourceCount: number;
  isTruncated: boolean;
  resources: ExportResource[];
};

const safeDate = (value: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(value);
const safeDateTime = (value: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

export async function collectVaultExport(userId: string, scope: ExportScope, limit: number): Promise<VaultExportData> {
  const where = scope.kind === 'LIST' ? { userId, lists: { some: { listId: scope.listId } } } : { userId };
  const list = scope.kind === 'LIST'
    ? await prisma.resourceList.findFirst({ where: { id: scope.listId, userId }, select: { name: true, description: true } })
    : null;
  if (scope.kind === 'LIST' && !list) throw Object.assign(new Error('List not found'), { status: 404 });

  const [owner, resourceTotal, resources] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } }),
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        title: true, description: true, url: true, resourceType: true, sourcePlatform: true, isFavorite: true, archivedAt: true, createdAt: true,
        categories: { select: { category: { select: { name: true } } } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    }),
  ]);

  return {
    owner,
    title: list?.name ?? 'My SNOQ vault',
    description: list?.description ?? 'A private export of your saved SNOQ resources.',
    generatedAt: new Date(),
    scope: list ? 'List' : 'Entire vault',
    resourceTotal,
    resourceCount: resources.length,
    isTruncated: resourceTotal > resources.length,
    resources: resources as ExportResource[],
  };
}

export async function buildVaultExcel(data: VaultExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SNOQ';
  workbook.created = data.generatedAt;
  const overview = workbook.addWorksheet('Overview', { views: [{ showGridLines: false }] });
  overview.mergeCells('A1:D1');
  overview.getCell('A1').value = 'SNOQ VAULT EXPORT';
  overview.getCell('A1').font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
  overview.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1D35' } };
  overview.getCell('A1').alignment = { vertical: 'middle' };
  overview.getRow(1).height = 38;
  overview.getCell('A3').value = 'Collection'; overview.getCell('B3').value = data.title;
  overview.getCell('A4').value = 'Scope'; overview.getCell('B4').value = data.scope;
  overview.getCell('A5').value = 'Resources'; overview.getCell('B5').value = data.resourceTotal;
  overview.getCell('A6').value = 'Generated'; overview.getCell('B6').value = safeDateTime(data.generatedAt);
  ['A3', 'A4', 'A5', 'A6'].forEach(reference => { overview.getCell(reference).font = { bold: true, color: { argb: 'FF3158E5' } }; });
  overview.mergeCells('A8:D8');
  overview.getCell('A8').value = data.isTruncated ? `This export includes the newest ${data.resourceCount.toLocaleString()} of ${data.resourceTotal.toLocaleString()} resources.` : 'This export includes every resource in the selected collection.';
  overview.getCell('A8').font = { italic: true, color: { argb: 'FF60708A' } };
  [22, 36, 22, 22].forEach((width, index) => { overview.getColumn(index + 1).width = width; });

  const sheet = workbook.addWorksheet('Resources');
  const headers = ['Title', 'Type', 'Source', 'Categories', 'Tags', 'Favorite', 'Archived', 'Saved', 'Description', 'URL'];
  sheet.addRow(headers);
  const header = sheet.getRow(1);
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1D35' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  header.height = 25;
  data.resources.forEach(resource => sheet.addRow([
    resource.title,
    resource.resourceType,
    resource.sourcePlatform ?? '—',
    resource.categories.map(item => item.category.name).join(', ') || '—',
    resource.tags.map(item => item.tag.name).join(', ') || '—',
    resource.isFavorite ? 'Yes' : 'No',
    resource.archivedAt ? 'Yes' : 'No',
    resource.createdAt,
    resource.description ?? '—',
    resource.url ?? '—',
  ]));
  [30, 18, 18, 28, 28, 12, 12, 16, 50, 48].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getColumn(8).numFmt = 'dd mmm yyyy';
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `J${Math.max(1, data.resources.length + 1)}` };
  return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}

function addPageHeader(doc: PDFKit.PDFDocument, data: VaultExportData, continuation = false) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FFFFFF');
  doc.save();
  doc.opacity(0.055).fillColor('#3158E5').font('Helvetica-Bold').fontSize(30);
  doc.rotate(-34, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.text(data.owner.email, 70, doc.page.height / 2 - 18, { width: doc.page.width - 140, align: 'center', ellipsis: true, lineBreak: false });
  doc.restore();
  doc.fillColor('#14233D').font('Helvetica-Bold').fontSize(continuation ? 18 : 24).text(continuation ? 'Resources, continued' : data.title, 44, continuation ? 92 : 90, { width: 507, ellipsis: true });
  if (!continuation) {
    doc.fillColor('#60708A').font('Helvetica').fontSize(9).text(`${data.scope} - Prepared ${safeDateTime(data.generatedAt)}`, 44, 121);
  }
}

function drawPageChrome(doc: PDFKit.PDFDocument, data: VaultExportData, pageNumber: number) {
  const cursor = { x: doc.x, y: doc.y };
  doc.roundedRect(44, 30, 36, 36, 11).fill('#3158E5');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(15).text('S', 56, 41, { width: 14, align: 'center' });
  doc.fillColor('#3158E5').font('Helvetica-Bold').fontSize(9).text('SNOQ', 92, 35);
  doc.fillColor('#74839A').font('Helvetica').fontSize(8).text('PRIVATE KNOWLEDGE REPORT', 92, 48);
  doc.roundedRect(350, 30, 201, 38, 10).fill('#F4F7FD');
  doc.fillColor('#60708A').font('Helvetica-Bold').fontSize(6.5).text('PREPARED FOR', 364, 39);
  doc.fillColor('#14233D').font('Helvetica-Bold').fontSize(8).text(data.owner.name?.trim() || data.owner.email, 364, 49, { width: 174, ellipsis: true, lineBreak: false });
  doc.fillColor('#74839A').font('Helvetica').fontSize(6.5).text(data.owner.email, 364, 59, { width: 174, ellipsis: true, lineBreak: false });
  drawReportFooter(doc, pageNumber);
  doc.x = cursor.x;
  doc.y = cursor.y;
}

function drawReportFooter(doc: PDFKit.PDFDocument, pageNumber: number) {
  const links = [
    { label: 'SNOQ', url: env.FRONTEND_URL },
    { label: 'Codersvoice', url: 'https://codersvoice.me' },
    { label: 'Instagram', url: 'https://www.instagram.com/codersvoice/' },
    { label: 'YouTube', url: 'https://www.youtube.com/channel/UCgVFnSkvmtPs3y3HvUJU7ig' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/company/codersvoice/?utm_medium=social&utm_source=heylink.me' },
    { label: 'More links', url: 'https://heylink.me/codersvoicehrithik/' },
  ];
  // Keep the footer inside PDFKit's printable area. Placing text below the
  // bottom margin silently creates a new page and separates the report body.
  const y = doc.page.height - 62;
  doc.moveTo(44, y - 8).lineTo(551, y - 8).strokeColor('#E0E8F2').lineWidth(0.8).stroke();
  let x = 44;
  doc.font('Helvetica').fontSize(7.2);
  links.forEach(({ label, url }) => {
    const width = doc.widthOfString(label) + 16;
    doc.fillColor('#52657F').text(label, x, y, { link: url, underline: false, lineBreak: false });
    doc.link(x, y, width, 12, url);
    x += width;
  });
  doc.fillColor('#94A3B8').fontSize(6.8).text(`Private SNOQ report - ${pageNumber}`, 430, y, { width: 121, align: 'right' });
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const columns = [30, 190, 150, 75, 62];
  const labels = ['#', 'RESOURCE', 'DETAILS', 'SAVED', 'OPEN'];
  let x = 44;
  doc.roundedRect(44, y, 507, 27, 8).fill('#14233D');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
  labels.forEach((label, index) => { doc.text(label, x + 8, y + 10, { width: columns[index] - 12, ellipsis: true }); x += columns[index]; });
  return { y: y + 27, columns };
}

export function buildVaultPdf(data: VaultExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true, info: { Title: `${data.title} | SNOQ export`, Author: 'SNOQ' } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    addPageHeader(doc, data);
    let y = 151;
    doc.fillColor('#52657F').font('Helvetica').fontSize(10.5).text(data.description, 44, y, { width: 507, height: 31, ellipsis: true });
    y += 48;
    doc.roundedRect(44, y, 157, 60, 12).fill('#EEF4FF');
    doc.roundedRect(212, y, 157, 60, 12).fill('#EEFBF5');
    doc.roundedRect(380, y, 171, 60, 12).fill('#FFF7E9');
    doc.fillColor('#3158E5').font('Helvetica-Bold').fontSize(21).text(String(data.resourceTotal), 60, y + 16);
    doc.fillColor('#60708A').font('Helvetica-Bold').fontSize(7.5).text('SAVED RESOURCES', 60, y + 41);
    doc.fillColor('#12956A').font('Helvetica-Bold').fontSize(11).text(data.scope.toUpperCase(), 228, y + 20, { width: 120, align: 'center' });
    doc.fillColor('#60708A').font('Helvetica-Bold').fontSize(7.5).text('COLLECTION TYPE', 228, y + 41, { width: 120, align: 'center' });
    doc.fillColor('#D88516').font('Helvetica-Bold').fontSize(9).text(data.isTruncated ? `Latest ${data.resourceCount} shown` : 'Complete collection', 396, y + 21, { width: 139, align: 'center' });
    doc.fillColor('#60708A').font('Helvetica-Bold').fontSize(7.5).text('REPORT COVERAGE', 396, y + 41, { width: 139, align: 'center' });
    y += 82;
    if (data.resources.length === 0) {
      doc.roundedRect(44, y, 507, 104, 14).fill('#F8FAFD').stroke('#E0E8F2');
      doc.fillColor('#14233D').font('Helvetica-Bold').fontSize(13).text('No resources in this export yet', 44, y + 32, { width: 507, align: 'center' });
      doc.fillColor('#60708A').font('Helvetica').fontSize(9).text('Save a resource in SNOQ, then generate a fresh report whenever you need it.', 72, y + 55, { width: 451, align: 'center' });
    }

    let table = data.resources.length > 0 ? drawTableHeader(doc, y) : { y, columns: [] as number[] };
    y = table.y;
    data.resources.slice(0, PDF_ITEM_LIMIT).forEach((resource, index) => {
      const categoryLine = resource.categories.map(item => item.category.name).join(', ') || 'Uncategorized';
      const tagLine = resource.tags.map(item => item.tag.name).join(', ');
      const sourceLine = [resource.resourceType, resource.sourcePlatform].filter(Boolean).join(' · ');
      const detailLine = [tagLine, resource.description].filter(Boolean).join(' · ') || 'No description added';
      const required = 72;
      if (y + required > doc.page.height - 82) {
        doc.addPage();
        addPageHeader(doc, data, true);
        table = drawTableHeader(doc, 123);
        y = table.y;
      }
      doc.rect(44, y, 507, required).fill(index % 2 ? '#F8FAFD' : '#FFFFFF').stroke('#E0E8F2');
      doc.fillColor('#3158E5').font('Helvetica-Bold').fontSize(8.5).text(String(index + 1), 52, y + 15, { width: 15, align: 'center' });
      doc.fillColor('#14233D').font('Helvetica-Bold').fontSize(9).text(resource.title, 82, y + 9, { width: 176, height: 12, ellipsis: true, lineBreak: false });
      doc.fillColor('#74839A').font('Helvetica').fontSize(7.2).text(resource.url ?? 'Private document', 82, y + 24, { width: 176, height: 10, ellipsis: true, lineBreak: false });
      doc.fillColor('#3158E5').font('Helvetica-Bold').fontSize(7.2).text(sourceLine, 272, y + 8, { width: 138, height: 10, ellipsis: true, lineBreak: false });
      doc.fillColor('#52657F').font('Helvetica-Bold').fontSize(7).text(categoryLine, 272, y + 20, { width: 138, height: 10, ellipsis: true, lineBreak: false });
      doc.fillColor('#74839A').font('Helvetica').fontSize(6.8).text(detailLine, 272, y + 32, { width: 138, height: 24, ellipsis: true });
      doc.fillColor('#60708A').font('Helvetica').fontSize(7.2).text(safeDate(resource.createdAt), 422, y + 30, { width: 60, align: 'center' });
      if (resource.url) {
        const buttonX = 489; const buttonY = y + 24; const buttonWidth = 47; const buttonHeight = 23;
        doc.roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 7).fill('#3158E5');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text('Open', buttonX, buttonY + 8, { width: buttonWidth, align: 'center', link: resource.url, underline: false });
        doc.link(buttonX, buttonY, buttonWidth, buttonHeight, resource.url);
      } else {
        doc.fillColor('#9AA8BA').font('Helvetica-Bold').fontSize(7).text('Private doc', 465, y + 16, { width: 75, align: 'center' });
      }
      y += required;
    });
    if (data.isTruncated) {
      doc.fillColor('#60708A').font('Helvetica-Oblique').fontSize(8).text(`The email report includes the newest ${PDF_ITEM_LIMIT} resources. Download the Excel export from SNOQ for up to ${EXCEL_ITEM_LIMIT.toLocaleString()} item rows.`, 44, y + 4, { width: 507 });
    }
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      doc.switchToPage(index);
      drawPageChrome(doc, data, index + 1);
    }
    doc.end();
  });
}

export const vaultExportLimits = { pdf: PDF_ITEM_LIMIT, excel: EXCEL_ITEM_LIMIT };
