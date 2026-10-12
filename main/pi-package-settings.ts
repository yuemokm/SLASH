import type {SettingsStore,CredentialCipher} from './settings.js';
import {piObservabilityConfigSchema,type PiObservabilityConfig} from './pi-observability.js';
import type {PiObservabilityView} from '../shared/pi-packages.js';
import {subagentSettingsSchema,DEFAULT_SUBAGENT_SETTINGS,type SubagentSettings} from '../shared/subagent-settings.js';
export class PiPackageSettings{
 constructor(private store:SettingsStore,private cipher:CredentialCipher){}
 subagents():SubagentSettings{return subagentSettingsSchema.parse(this.store.get('pi-subagents:settings',DEFAULT_SUBAGENT_SETTINGS));}
 saveSubagents(input:unknown):SubagentSettings{const config=subagentSettingsSchema.parse(input);this.store.set('pi-subagents:settings',config);return config;}
 setSubagentsEnabled(enabled:boolean):SubagentSettings{return this.saveSubagents({...this.subagents(),enabled});}
 view():PiObservabilityView{const value=this.store.get<Omit<PiObservabilityConfig,'secretKey'>>('pi-observability:config',{enabled:false,baseUrl:'',publicKey:'',mode:'metadata'});return{...value,hasSecret:Boolean(this.store.get<string>('pi-observability:secret',''))};}
 config():PiObservabilityConfig{const value=this.view();let secretKey='';if(value.enabled&&value.hasSecret){if(!this.cipher.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');secretKey=this.cipher.decryptString(Buffer.from(this.store.get<string>('pi-observability:secret',''),'base64'));}return piObservabilityConfigSchema.parse({...value,secretKey});}
 save(input:{enabled:boolean;baseUrl:string;publicKey:string;secretKey?:string;mode:'metadata'}){
  const current=this.view(),bound=current.baseUrl===input.baseUrl&&current.publicKey===input.publicKey;
  let preserved='';if(bound&&current.hasSecret&&!input.secretKey){if(!this.cipher.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');preserved=this.cipher.decryptString(Buffer.from(this.store.get<string>('pi-observability:secret',''),'base64'));}
  const secretKey=input.secretKey||preserved;const value=piObservabilityConfigSchema.parse({...input,secretKey});
  if(secretKey&&!this.cipher.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE: 系统安全存储不可用');
  const {secretKey:secret,...config}=value;this.store.set('pi-observability:config',config);this.store.set('pi-observability:secret',secret?this.cipher.encryptString(secret).toString('base64'):'');return this.view();
 }
}
