import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';
import { extractOfficeText, isOfficeDocument, OFFICE_EXTRACTION_LIMITS } from '../main/office-extraction.js';

function docx(text = '真实合成正文', mediaBytes = 0): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  zip.addFile('_rels/.rels', Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  zip.addFile('word/document.xml', Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`));
  if (mediaBytes) zip.addFile('word/media/image1.png', randomBytes(mediaBytes));
  return zip.toBuffer();
}

async function workbookBytes(build: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function rewriteEntry(bytes: Buffer, entry: string, content: string): Buffer {
  const zip = new AdmZip(bytes);
  zip.updateFile(entry, Buffer.from(content));
  return zip.toBuffer();
}

function changeDeclaredSize(bytes: Buffer, entryName: string, size: number): Buffer {
  const copy = Buffer.from(bytes);
  for (let offset = copy.indexOf(Buffer.from('504b0102', 'hex')); offset >= 0; offset = copy.indexOf(Buffer.from('504b0102', 'hex'), offset + 4)) {
    const nameLength = copy.readUInt16LE(offset + 28);
    if (copy.subarray(offset + 46, offset + 46 + nameLength).toString('utf8') === entryName) {
      copy.writeUInt32LE(size, offset + 24);
      return copy;
    }
  }
  throw new Error('Fixture entry missing');
}

test('Office detection is extension-only and case insensitive; unsupported/encrypted inputs are readable failures', async () => {
  assert.equal(isOfficeDocument('test.DOCX'), true);
  assert.equal(isOfficeDocument('test.XLSX'), true);
  for (const name of ['test.doc', 'test.xls', 'test.xlsm', 'test.docx.exe']) assert.equal(isOfficeDocument(name), false);
  await assert.rejects(extractOfficeText(Buffer.from('x'), 'test.xls'), /OFFICE_UNSUPPORTED/);
  await assert.rejects(extractOfficeText(Buffer.from('not zip'), 'test.docx'), /OFFICE_INVALID_PACKAGE.*加密/);
  await assert.rejects(extractOfficeText(docx(), 'test.xlsx'), /OFFICE_INVALID_PACKAGE/);
});

test('DOCX with a 36 MB synthetic media payload extracts body without the original Files.read 2 MB restriction', async () => {
  const bytes = docx('字段说明与校验规则', 36_000_000);
  assert.ok(bytes.length > 36_000_000);
  const text = await extractOfficeText(bytes, '资料.DOCX');
  assert.match(text, /字段说明与校验规则/);
  assert.match(text, /图片未做 OCR/);
});

test('XLSX retains exact coordinates, scalar types, rich text, hyperlink, date and numeric format', async () => {
  const bytes = await workbookBytes(workbook => {
    const sheet = workbook.addWorksheet('字段梳理');
    sheet.getCell('A1').value = '编号';
    sheet.getCell('C4').value = '00017';
    sheet.getCell('D4').value = 17;
    sheet.getCell('D4').numFmt = '00000';
    sheet.getCell('E4').value = false;
    sheet.getCell('F4').value = new Date('2026-10-05T00:00:00.000Z');
    sheet.getCell('F4').numFmt = 'yyyy-mm-dd';
    sheet.getCell('G4').value = { richText: [{ text: '说明' }, { text: '字段', font: { bold: true } }] };
    sheet.getCell('H4').value = { text: '参考链接', hyperlink: 'https://example.invalid/resource' };
    sheet.getCell('I4').value = { error: '#DIV/0!' };
  });
  const text = await extractOfficeText(bytes, 'fields.xlsx');
  assert.match(text, /工作表: "字段梳理"/);
  assert.match(text, /C4: "文本: 00017"/);
  assert.match(text, /D4: "数值: 17"；数字格式: "00000"/);
  assert.match(text, /E4: "布尔值: false"/);
  assert.match(text, /F4: "日期时间（ISO）: 2026-10-05T00:00:00.000Z"/);
  assert.match(text, /G4: "富文本: 说明字段"/);
  assert.match(text, /H4: .*https:\/\/example.invalid\/resource；未请求/);
  assert.match(text, /I4: .*#DIV\/0!/);
  assert.match(text, /不模拟 Excel 显示格式/);
  assert.match(text, /批注、数据验证约束和图表未提取/);
});

test('XLSX formulas are not evaluated; zero/false cached values, shared formulas and missing cache are explicit', async () => {
  const bytes = await workbookBytes(workbook => {
    const sheet = workbook.addWorksheet('公式');
    sheet.getCell('A1').value = { formula: '1-1', result: 0 };
    sheet.getCell('A2').value = { formula: '1=2', result: false };
    sheet.getCell('B1').value = { formula: 'SUM(A1:A2)' };
    sheet.getCell('C1').value = { formula: 'WEBSERVICE("https://example.invalid/secret")' };
    sheet.getCell('D1').value = { formula: 'A1+1', result: 1, shareType: 'shared', ref: 'D1:D2' };
    sheet.getCell('D2').value = { sharedFormula: 'D1', result: 1 };
    sheet.getCell('E1').value = { formula: 'TODAY()', result: new Date('2026-10-05T00:00:00.000Z') };
    sheet.getCell('E1').numFmt = 'yyyy-mm-dd';
  });
  const text = await extractOfficeText(bytes, 'formulas.xlsx');
  assert.match(text, /A1: .*公式 =1-1 \[未执行\].*缓存结果（待核对）: 数值: 0/);
  assert.match(text, /A2: .*缓存结果（待核对）: 布尔值: false/);
  assert.match(text, /B1: .*无缓存结果，待核对/);
  assert.match(text, /C1: .*WEBSERVICE.*无缓存结果，待核对/);
  assert.match(text, /D2: .*公式 =A2\+1/);
  assert.match(text, /E1: .*缓存结果（待核对）: 日期时间（ISO）/);
});

test('an empty shared string item is retained at its coordinate with an explicit parser caveat', async () => {
  const bytes = await workbookBytes(workbook => { workbook.addWorksheet('空共享文本').getCell('A1').value = 'synthetic-empty-shared-string'; });
  const xml = new AdmZip(bytes).readAsText('xl/sharedStrings.xml');
  const fixture = rewriteEntry(bytes, 'xl/sharedStrings.xml', xml.replace('<si><t>synthetic-empty-shared-string</t></si>', '<si/>'));
  const text = await extractOfficeText(fixture, 'empty-shared-string.xlsx');
  assert.match(text, /A1: .*空共享文本（解析器未返回可见文本，待核对）/);
  assert.doesNotMatch(text, /synthetic-empty-shared-string/);
});

test('XLSX includes hidden/very hidden sheets, blank hidden row/column metadata, empty sheets and merged ranges', async () => {
  let bytes = await workbookBytes(workbook => {
    const sheet = workbook.addWorksheet('隐藏字段', { state: 'hidden' });
    sheet.getCell('B3').value = '内部字段';
    sheet.getRow(3).hidden = true;
    sheet.getRow(8).hidden = true;
    sheet.getColumn(2).hidden = true;
    sheet.getColumn(7).hidden = true;
    sheet.getCell('A1').value = '表头';
    sheet.mergeCells('A1:D1');
    workbook.addWorksheet('空表');
    workbook.addWorksheet('系统表', { state: 'veryHidden' }).getCell('A1').value = '配置';
  });
  const sheetXml = new AdmZip(bytes).readAsText('xl/worksheets/sheet1.xml');
  bytes = rewriteEntry(bytes, 'xl/worksheets/sheet1.xml', sheetXml.replace('</sheetData>', '<row r="8" hidden="1"/></sheetData>'));
  const text = await extractOfficeText(bytes, 'hidden.xlsx');
  assert.match(text, /隐藏字段.*隐藏工作表/);
  assert.match(text, /隐藏行: 3/);
  assert.match(text, /隐藏行: 8/);
  assert.match(text, /隐藏列: G \(7\)/);
  assert.match(text, /合并区域: A1:D1/);
  assert.match(text, /B3 \[隐藏行、隐藏列\]: "文本: 内部字段"/);
  assert.doesNotMatch(text, /B1:/);
  assert.match(text, /空表[^]*\[空表：无非空单元格\]/);
  assert.match(text, /系统表.*深度隐藏工作表/);
});

test('DOCX and XLSX output limits reject rather than return a silently truncated extract', async () => {
  const largeText = randomBytes(1_550_000).toString('base64');
  await assert.rejects(extractOfficeText(docx(largeText), 'large.docx'), /OFFICE_TEXT_LIMIT.*未完成全文提取/);
  const bytes = await workbookBytes(workbook => {
    const sheet = workbook.addWorksheet('大文本');
    for (let row = 1; row <= 100; row++) sheet.getCell(`A${row}`).value = largeText.slice(row * 10, row * 10 + 21_000);
  });
  await assert.rejects(extractOfficeText(bytes, 'large.xlsx'), /OFFICE_TEXT_LIMIT.*未完成全文提取/);
});

test('input/package declared sizes and XML entry limits are checked before Office libraries allocate', async () => {
  await assert.rejects(extractOfficeText(Buffer.alloc(OFFICE_EXTRACTION_LIMITS.inputBytes + 1), 'large.docx'), /OFFICE_INPUT_LIMIT/);
  const bytes = docx();
  await assert.rejects(extractOfficeText(changeDeclaredSize(bytes, 'word/document.xml', 20_000_000), 'bad.docx'), /OFFICE_ZIP_LIMIT/);
  const entries = new AdmZip(bytes);
  for (let number = 0; number <= OFFICE_EXTRACTION_LIMITS.entries; number++) entries.addFile(`extra/${number}/`, Buffer.alloc(0));
  await assert.rejects(extractOfficeText(entries.toBuffer(), 'many.docx'), /OFFICE_ZIP_LIMIT/);
});

test('ZIP bomb ratios, lying sizes, CRC corruption and local/central method mismatch are rejected', async () => {
  const bomb = new AdmZip(docx());
  bomb.addFile('word/media/bomb.bin', Buffer.alloc(10_000_000));
  await assert.rejects(extractOfficeText(bomb.toBuffer(), 'bomb.docx'), /OFFICE_ZIP_RATIO_LIMIT/);
  await assert.rejects(extractOfficeText(changeDeclaredSize(docx(), 'word/document.xml', 1), 'lie.docx'), /OFFICE_ZIP_INVALID/);
  const badCrc = Buffer.from(docx());
  const central = badCrc.indexOf(Buffer.from('504b0102', 'hex'));
  badCrc.writeUInt32LE(0, central + 16);
  await assert.rejects(extractOfficeText(badCrc, 'crc.docx'), /OFFICE_ZIP_INVALID/);
  const local = Buffer.from(docx());
  local.writeUInt16LE(0, 8);
  await assert.rejects(extractOfficeText(local, 'method.docx'), /OFFICE_ZIP_INVALID/);
});

test('DTD, duplicate aliases and unsafe entry paths are rejected without extracting files', async () => {
  const dtd = rewriteEntry(docx(), 'word/document.xml', '<!DOCTYPE document [<!ENTITY evil SYSTEM "file:///secret">]><document>&evil;</document>');
  await assert.rejects(extractOfficeText(dtd, 'entity.docx'), /OFFICE_XML_UNSAFE/);
  const duplicate = new AdmZip(docx());
  duplicate.addFile('WORD/document.xml', Buffer.from('<document/>'));
  await assert.rejects(extractOfficeText(duplicate.toBuffer(), 'duplicate.docx'), /OFFICE_ZIP_UNSAFE/);
  const traversal = new AdmZip(docx());
  const entry = traversal.addFile('xx/escape.xml', Buffer.from('<escape/>'));
  // addFile normalizes paths; assign the raw fixture name afterward to retain
  // the malicious path exactly as it would appear in an incoming package.
  entry.entryName = '../escape.xml';
  await assert.rejects(extractOfficeText(traversal.toBuffer(), 'escape.docx'), /OFFICE_ZIP_UNSAFE/);
});

test('forged XML expanded size cannot bypass bounded actual inflation', async () => {
  const zip = new AdmZip(docx());
  zip.addFile('word/large.xml', Buffer.from(`<x>${randomBytes(13_000_000).toString('base64')}</x>`));
  const bytes = changeDeclaredSize(zip.toBuffer(), 'word/large.xml', 100);
  await assert.rejects(extractOfficeText(bytes, 'oversized.docx'), /OFFICE_ZIP_LIMIT/);
});

test('small XLSX with malicious merge geometry, cell address or column span is rejected before ExcelJS', async () => {
  const bytes = await workbookBytes(workbook => { workbook.addWorksheet('正常').getCell('A1').value = 'x'; });
  const original = new AdmZip(bytes).readAsText('xl/worksheets/sheet1.xml');
  for (const insertion of ['<mergeCells count="1"><mergeCell ref="A1:XFD1048576"/></mergeCells>', '<cols><col min="1" max="2147483647"/></cols>']) {
    const forged = rewriteEntry(bytes, 'xl/worksheets/sheet1.xml', original.replace('</worksheet>', `${insertion}</worksheet>`));
    await assert.rejects(extractOfficeText(forged, 'unsafe.xlsx'), /OFFICE_SHEET_LIMIT/);
  }
  await assert.rejects(extractOfficeText(rewriteEntry(bytes, 'xl/worksheets/sheet1.xml', original.replace('r="A1"', 'r="ZZZ9999999"')), 'coordinate.xlsx'), /OFFICE_SHEET_LIMIT/);
});
