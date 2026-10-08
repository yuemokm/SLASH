// Offline recovery verification for one explicitly identified legacy Slash profile.
// Never launch the normal app entry point or copy user workspaces/task history.
import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import electronPath from 'electron';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceProfile = path.join(process.env.APPDATA, 'PM Slash');
const sourceDb = path.join(sourceProfile, 'pm-slash.sqlite');
const localState = path.join(sourceProfile, 'Local State');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = async filename => sha(await fs.readFile(filename));
const stableError = message => /^[A-Z][A-Z0-9_]+$/.test(message) ? message : 'LEGACY_PROFILE_PREPARATION_FAILED';
let profile, resultPath;
const report = {status: 'preparing', cloudExecuted: false, model: null, localDecrypt: false, sourceUnchanged: false};
let before;

try {
  const realSource = await fs.realpath(sourceProfile);
  const sourceStat = await fs.lstat(sourceDb), localStat = await fs.lstat(localState);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || !localStat.isFile() || localStat.isSymbolicLink()) throw Error('LEGACY_PROFILE_NOT_REGULAR');
  before = {database: await digest(sourceDb), localState: await digest(localState)};
  // SELECT only the requested legacy model object and its corresponding cipher.
  // Other state fields are never selected, parsed, copied, or printed.
  const db = new DatabaseSync(sourceDb, {readOnly: true});
  let legacyModel, encrypted;
  try {
    const row = db.prepare("SELECT json_extract(value,'$.model') AS model FROM kv WHERE key='state'").get();
    if (!row?.model) throw Error('LEGACY_MODEL_NOT_FOUND');
    legacyModel = JSON.parse(String(row.model));
    if (typeof legacyModel.baseUrl !== 'string' || typeof legacyModel.id !== 'string') throw Error('LEGACY_MODEL_INVALID');
    const secret = db.prepare("SELECT value FROM kv WHERE key='key'").get();
    encrypted = secret ? JSON.parse(String(secret.value)) : '';
    if (typeof encrypted !== 'string' || !encrypted) throw Error('LEGACY_CREDENTIAL_MISSING');
  } finally {db.close();}
  const testRoot = path.join(repo, '.test-data'); await fs.mkdir(testRoot, {recursive: true});
  profile = await fs.mkdtemp(path.join(testRoot, 'legacy-model-profile-'));
  if (path.dirname(profile) !== testRoot || profile === realSource) throw Error('ISOLATION_PROFILE_INVALID');
  resultPath = path.join(profile, 'recovery-result.json');
  report.profile = profile;
  const isolatedDb = new DatabaseSync(path.join(profile, 'slash.sqlite'));
  try {
    isolatedDb.exec('CREATE TABLE kv (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
    const insert = isolatedDb.prepare('INSERT INTO kv VALUES(?,?)');
    insert.run('state', JSON.stringify({root: '', mounts: [], conversations: [], changes: [], runs: [], connections: [], models: [], model: legacyModel}));
    insert.run('key', JSON.stringify(encrypted));
  } finally {isolatedDb.close();}
  legacyModel = undefined; encrypted = undefined;
  await fs.copyFile(localState, path.join(profile, 'Local State'), constants.COPYFILE_EXCL);
  const harness = path.join(profile, 'offline-recovery-harness.mjs');
  const moduleURL = name => pathToFileURL(path.join(repo, 'dist', 'main', name + '.js')).href;
  await fs.writeFile(harness, `
import {app,safeStorage,session} from 'electron';
import fs from 'node:fs/promises';
const profile=${JSON.stringify(profile)};
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.commandLine.appendSwitch('disable-background-networking');
app.on('window-all-closed',()=>{});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const result={status:'failed',localDecrypt:false,model:null};
let store;
const stage=async value=>fs.writeFile(${JSON.stringify(path.join(profile, 'harness-progress.json'))},JSON.stringify({stage:value}));
// Electron waits for the main ESM module to finish before emitting ready.
// Do not top-level-await app.whenReady() and deadlock that lifecycle.
async function migrate(){
try {
 await stage('waiting_electron_ready');
 await app.whenReady();
 await stage('electron_ready_loading_modules');
 session.defaultSession.webRequest.onBeforeRequest((_details,callback)=>callback({cancel:true}));
 if(!safeStorage.isEncryptionAvailable())throw Error('SAFE_STORAGE_UNAVAILABLE');
 const {Store}=await import(${JSON.stringify(moduleURL('store'))});
 const {ModelSettings}=await import(${JSON.stringify(moduleURL('settings'))});
 const {resolveModelLimits}=await import(${JSON.stringify(moduleURL('model-limits'))});
 const {thinkingFingerprint}=await import(${JSON.stringify(moduleURL('model-thinking'))});
 await stage('modules_loaded_migrating_isolated_profile');
 store=new Store(profile);
 const state=store.get('state',null);
 if(!state||state.root||state.mounts.length||state.conversations.length||state.changes.length||state.runs.length||state.connections.length)throw Error('ISOLATION_SEED_INVALID');
 const settings=new ModelSettings(store,safeStorage,{get:()=>state,save:()=>store.set('state',state)});
 settings.initialize();
 const model=state.models?.find(value=>value.id===state.defaultModelId);
 if(!model)throw Error('MIGRATED_MODEL_NOT_FOUND');
 // Plaintext exists only within the real safeStorage call, never in results/logs.
 result.localDecrypt=Boolean(settings.defaultCredential());
 if(!result.localDecrypt)throw Error('CREDENTIAL_LOCAL_DECRYPT_FAILED');
 const input={entryId:model.id,baseUrl:model.baseUrl,id:model.modelId,protocol:model.protocol,contextWindow:model.contextWindow,maxTokens:model.maxTokens};
 const limits=resolveModelLimits(input,thinkingFingerprint(input));
 result.model={provider:model.provider,name:model.name,protocol:model.protocol,hasKey:model.hasKey,limits:{contextWindow:limits.contextWindow,maxTokens:limits.maxTokens,status:limits.status,contextWindowSource:limits.contextWindowSource,maxTokensSource:limits.maxTokensSource}};
 if(state.root||state.mounts.length||state.conversations.length||state.changes.length||state.runs.length||state.connections.length)throw Error('ISOLATION_MIGRATION_INVALID');
 if(store.get('key','')!=='')throw Error('LEGACY_CIPHER_NOT_MIGRATED');
 result.status='prepared_local_decrypt_verified';
}catch(error){
 const raw=error instanceof Error?error.message:'';
 result.reason=raw.startsWith('SETTINGS_MIGRATION_FAILED')?'SETTINGS_MIGRATION_FAILED':/^[A-Z][A-Z0-9_]+$/.test(raw)?raw:/^ERR_[A-Z0-9_]+$/.test(error?.code??'')?error.code:'OFFLINE_MIGRATION_FAILED';
 process.exitCode=1;
}finally{
 store?.close();
 await fs.writeFile(${JSON.stringify(path.join(profile, 'harness-result.json'))},JSON.stringify(result),{flag:'wx'});
 app.exit(process.exitCode??0);
}
}
void migrate();
`, {flag: 'wx'});
  const env = {...process.env, PM_SLASH_DATA_DIR: profile}; delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [harness], {cwd: repo, env, windowsHide: true, stdio: 'ignore'});
    const timeout = setTimeout(() => {child.kill(); reject(Error('OFFLINE_HARNESS_TIMEOUT'));}, 45000);
    child.once('error', () => {clearTimeout(timeout); reject(Error('OFFLINE_HARNESS_START_FAILED'));});
    child.once('exit', value => {clearTimeout(timeout); resolve(value);});
  });
  const result = JSON.parse(await fs.readFile(path.join(profile, 'harness-result.json'), 'utf8'));
  report.status = result.status; report.localDecrypt = result.localDecrypt; report.model = result.model;
  if (code !== 0 || result.status !== 'prepared_local_decrypt_verified') throw Error(result.reason ?? 'OFFLINE_HARNESS_FAILED');
} catch (error) {
  report.status = 'failed'; report.reason = stableError(error instanceof Error ? error.message : 'LEGACY_PROFILE_PREPARATION_FAILED');
  process.exitCode = 1;
} finally {
  if (before) {
    try {
      const after = {database: await digest(sourceDb), localState: await digest(localState)};
      report.sourceHashes = {before, after};
      report.sourceUnchanged = before.database === after.database && before.localState === after.localState;
      if (!report.sourceUnchanged) {report.status = 'failed'; report.reason = 'LEGACY_SOURCE_CHANGED'; process.exitCode = 1;}
    } catch {report.status = 'failed'; report.reason = 'LEGACY_SOURCE_RECHECK_FAILED'; process.exitCode = 1;}
  }
  if (resultPath) await fs.writeFile(resultPath, JSON.stringify(report, null, 2), {flag: 'wx'});
  console.log(JSON.stringify(report));
}
