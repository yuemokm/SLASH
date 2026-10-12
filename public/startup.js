// This small, unbundled script can report a failed or slow module load before React starts.
(() => {
 const status=()=>document.getElementById('startup-status');
 const retry=()=>document.getElementById('startup-retry');
 document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.id==='startup-retry')window.location.reload();});
 function failed(){
  if(!status())return;
  document.getElementById('startup-message').textContent='工作台加载失败';
  document.getElementById('startup-detail').textContent='请重新加载。如果仍然失败，请保留启动窗口中的报错。';
  if(retry())retry().hidden=false;
  console.error('[slash-startup] Renderer entry failed before the workbench mounted.');
 }
 window.addEventListener('error',event=>{if(event.target instanceof HTMLScriptElement||event.error)failed();},true);
 window.addEventListener('unhandledrejection',failed);
 setTimeout(()=>{
  if(!status()||!retry()?.hidden)return;
  document.getElementById('startup-detail').textContent='界面仍在准备中。可以继续等待；若长时间没有变化，请重新加载。';
  retry().hidden=false;
 },45_000);
})();
