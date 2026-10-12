/** Clear the previous verdict before requesting, and replace it on every outcome. */
export async function runModelTextTest(request:()=>Promise<unknown>,show:(text:string)=>void):Promise<void>{
 show('');
 try{
  const result=await request() as {reply?:unknown;notice?:unknown}|undefined;
  if(!result||typeof result.reply!=='string'||!result.reply.trim())throw Error('文字测试未通过：未收到有效的文字测试结果。');
  const notice=typeof result.notice==='string'&&result.notice.trim()?result.notice:'文字连接测试通过；仅验证本次文字回复，不证明工具调用或图片能力。';
  show(`${notice} 模型回复：${result.reply.trim()}`);
 }catch(error){
  const reason=error instanceof Error?error.message:String(error);
  show(reason.startsWith('文字测试未通过：')?reason:`文字测试未通过：${reason}`);
  throw error;
 }
}
