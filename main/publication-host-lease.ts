export class PublicationHostGuardError extends Error {constructor(error:unknown){super(error instanceof Error?error.message:'PUBLICATION_GUARD_REJECTED',{cause:error});this.name='PublicationHostGuardError';}}
import {AsyncLocalStorage} from 'node:async_hooks';
/** Transient host callback authority. Derived asynchronous work retains ALS,
 * but cannot retain authority after the owner's finally revokes its token. */
export class PublicationHostLease<T> {
 private readonly local=new AsyncLocalStorage<{token:symbol;value:T}>();
 private readonly active=new Map<symbol,T>();
 async run<R>(value:T,callback:()=>Promise<R>):Promise<R>{const token=Symbol('publication-host');this.active.set(token,value);try{return await this.local.run({token,value},callback);}finally{this.active.delete(token);}}
 current():T|undefined {const lease=this.local.getStore();if(!lease)return;if(this.active.get(lease.token)!==lease.value)throw Error('PUBLICATION_HOST_LEASE_REVOKED');return lease.value;}
 require(value:T){if(this.current()!==value)throw Error('PUBLICATION_HOST_LEASE_IDENTITY');}
}
