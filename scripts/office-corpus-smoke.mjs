// Run with: npx tsx scripts/office-corpus-smoke.mjs [authorized-reference-folder]
// Originals are read only. This script never initializes a project/workspace,
// edits AGENTS.md, overwrites copies, or prints reference document contents.
import fs from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { extractOfficeText, isOfficeDocument, OFFICE_EXTRACTION_LIMITS } from '../main/office-extraction.ts';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(process.argv[2] ?? 'E:\\code\\slash test\\资源\\参考资料');
const runRoot = path.join(workspace, '.test-data', `office-corpus-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const copyRoot = path.join(runRoot, 'source_处理副本');
const textRoot = path.join(runRoot, 'extracted');

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function collect(folder) {
  const files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing linked corpus entry: ${target}`);
    if (entry.isDirectory()) files.push(...await collect(target));
    else if (entry.isFile() && isOfficeDocument(entry.name)) files.push(target);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

await fs.mkdir(copyRoot, { recursive: true });
await fs.mkdir(textRoot, { recursive: true });
const sources = await collect(sourceRoot);
const report = {
  startedAt: new Date().toISOString(),
  sourceRoot,
  runRoot,
  boundary: 'Parser-only smoke: isolated copies, no Service.workspace/project mutation; service/UI integration verified separately.',
  limits: OFFICE_EXTRACTION_LIMITS,
  records: [],
};
const before = new Map();
for (const source of sources) before.set(source, await sha256(source));
for (const source of sources) {
  const started = performance.now();
  const relative = path.relative(sourceRoot, source);
  const extension = path.extname(relative);
  const copyRelative = `${relative.slice(0, -extension.length)}_处理副本${extension}`;
  const copyPath = path.join(copyRoot, copyRelative);
  const outputPath = path.join(textRoot, `${relative}.txt`);
  const record = { sourcePath: source, relativePath: relative, copyPath, sourceSha256Before: before.get(source), status: 'pending' };
  try {
    const info = await fs.lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Corpus source changed to a non-regular file');
    record.inputBytes = info.size;
    await fs.mkdir(path.dirname(copyPath), { recursive: true });
    await fs.copyFile(source, copyPath, constants.COPYFILE_EXCL);
    const bytes = await fs.readFile(copyPath);
    record.copySha256 = createHash('sha256').update(bytes).digest('hex');
    if (record.copySha256 !== record.sourceSha256Before) throw new Error('SOURCE_CHANGED: copy differs from pre-run source hash');
    const text = await extractOfficeText(bytes, path.basename(copyPath));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, text, { flag: 'wx' });
    record.outputPath = outputPath;
    record.outputBytes = Buffer.byteLength(text, 'utf8');
    record.outputCharacters = text.length;
    record.outputLines = text.split('\n').length;
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
  }
  record.elapsedMs = Math.round(performance.now() - started);
  report.records.push(record);
  // Progress contains counts only, never document text or fields.
  console.log(JSON.stringify({ processed: report.records.length, total: sources.length, status: record.status, elapsedMs: record.elapsedMs }));
}
let originalHashesUnchanged = true;
for (const record of report.records) {
  record.sourceSha256After = await sha256(record.sourcePath);
  record.originalUnchanged = record.sourceSha256Before === record.sourceSha256After;
  originalHashesUnchanged &&= record.originalUnchanged;
}

// A synthetic example illustrates coordinates/types/hidden/formula semantics
// without copying any private corpus content into reports or terminal output.
const sampleWorkbook = new ExcelJS.Workbook();
const sampleSheet = sampleWorkbook.addWorksheet('合成字段样例');
sampleSheet.getCell('A1').value = '字段';
sampleSheet.getCell('B1').value = '编号';
sampleSheet.getCell('A2').value = '订单编号';
sampleSheet.getCell('B2').value = '00017';
sampleSheet.getCell('C2').value = { formula: '1-1', result: 0 };
sampleSheet.getCell('D2').value = { formula: 'TODAY()' };
sampleSheet.getColumn(4).hidden = true;
const sample = await extractOfficeText(Buffer.from(await sampleWorkbook.xlsx.writeBuffer()), '合成字段样例.xlsx');
await fs.writeFile(path.join(runRoot, 'synthetic-structured-sample.txt'), sample, { flag: 'wx' });
report.syntheticSamplePath = path.join(runRoot, 'synthetic-structured-sample.txt');
report.completedAt = new Date().toISOString();
report.summary = {
  files: report.records.length,
  docx: report.records.filter(record => /\.docx$/i.test(record.sourcePath)).length,
  xlsx: report.records.filter(record => /\.xlsx$/i.test(record.sourcePath)).length,
  passed: report.records.filter(record => record.status === 'passed').length,
  failed: report.records.filter(record => record.status === 'failed').length,
  originalHashesUnchanged,
};
const reportPath = path.join(runRoot, 'report.json');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ ...report.summary, reportPath }));
if (report.summary.failed || !originalHashesUnchanged) process.exitCode = 1;
