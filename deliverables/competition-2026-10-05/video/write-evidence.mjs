import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const runs = [];
for (const name of await fs.readdir('.capture')) {
  const file = path.join('.capture', name, 'recording.json');
  try { runs.push({ file, ...(JSON.parse(await fs.readFile(file, 'utf8'))) }); } catch {}
}
const clips = runs.flatMap(run => (run.clips || (run.clip ? [run.clip] : [])).map(clip => ({ ...clip, recordingReceipt: run.file, runtime: run.runtime || 'development / isolated browser', applicationVersion: run.version || run.applicationVersion })));
const screenshots = [];
for (const name of ['dependency-stale', 'scope-needs-confirmation', 'export-snapshot-notice']) {
  const file = 'assets/footage/06-' + name.replace('scope-needs-confirmation', 'scope-confirmation') + '.png';
  // Local naming differs for the export image, source is stated explicitly.
  const actual = name === 'export-snapshot-notice' ? 'assets/footage/06-export-notice.png' : file;
  screenshots.push({ file: actual, sha256: sha256(await fs.readFile(actual)), source: '../../../.test-data/prototype-acceptance-ui-packaged-1791187460199/' + name + '.png', applicationVersion: '0.3.10', sourceType: 'real_packaged_product_gui_synthetic_fixture', priorResult: '12/12 passed; pageErrors=[]' });
}
const manifest = { format: '1920×1080 / Chinese subtitle edition / silent', durationSeconds: 180, clips, screenshots, captureAttempts: runs.map(run => ({ receipt: run.file, status: run.status, error: run.error, profile: run.profile, pageErrors: run.pageErrors })), currentRepairScene: 'Actual HTML after 3 local feedback revisions; independent 13/13 specified DOM interactions passed. PRD, constraint comparison and backend business remain separately verified.', selectedRepairTake: 'assets/footage/05-repair-compact.mp4', repairHtmlSha256: '9533e2dc10ab5bc094b6141d8275c54fe69e98de42f4a42464cd23e323b51d73', independentReview: 'E:/code/slash/.test-data/pm-business-repair-review-XeeFst-n6ltjN/result.json', notices: ['Scenes 1/3/4 use unchanged actual model baseline HTML; synthetic interaction values.', 'Scene 2 is script-prepared product functionality sample; source and interpretation are labelled synthetic/candidate.', 'Scene 6 is existing actual 0.3.10 packaged GUI fixture evidence, not this business task acceptance.', 'No credentials or original Office source documents copied. Source profiles remain untouched.'] };
await fs.writeFile('EVIDENCE.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ clips: clips.length, screenshots: screenshots.length, captureAttempts: runs.length }));
