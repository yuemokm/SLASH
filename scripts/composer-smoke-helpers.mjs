// Shared selectors for the custom composer controls. No native menus or cloud calls.
import fs from 'node:fs/promises';
import path from 'node:path';

// Keep the older regression fixtures explicit: new projects now use a role tree.
// These extra mounts verify that existing user directories still work.
export async function ensureLegacyFixtureMounts(service) {
 for (const [name,write] of [['参考资料',false],['产出材料',true],['原型',true]]) {
  if(service.state.mounts.some(mount=>mount.name===name))continue;
  const directory=path.join(service.state.root,name);await fs.mkdir(directory,{recursive:true});await service.mount(directory,write);
 }
}
// Resolve a real category directory inside the resource mount. Never assume
// each child directory is a separate mount or that example files were seeded.
export function projectResourceLocation(tree, category='参考资料') {
 const root=tree.appliedNodes.find(node=>node.role==='resource');
 const node=root?.children.find(node=>node.name===category||(category==='参考资料'&&node.id==='project-materials'));
 const mountId=node?.mountId||root?.mountId, mount=tree.mounts.find(item=>item.id===mountId);
 if(!node?.path||!root?.path||!mount)throw Error(`找不到已应用的资源目录：${category}`);
 const normalize=value=>value.replace(/\\/g,'/').replace(/\/$/,'');
 const prefix=node.mountId&&node.mountId!==root.mountId?'':normalize(node.path).slice(normalize(root.path).length+1);
 return {mountId,path:prefix,directory:path.join(mount.path,prefix),file:name=>path.posix.join(prefix,name)};
}
export const composerControlLabel = label => label === 'Agent 模式' ? '模式' : label === '运行权限模式' ? '权限' : label;
export function composerTrigger(page, label) {
 return page.getByRole('button', {name: composerControlLabel(label), exact:true});
}
export function composerPopup(page, label) {
 return page.getByRole('dialog', {name: composerControlLabel(label), exact:true});
}
export async function chooseComposerModel(page, label) {
 await composerTrigger(page,'选择模型').click();
 await page.getByRole('listbox',{name:'选择模型'}).getByRole('option',{name:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\s|$)')}).click();
 await page.keyboard.press('Escape');
 await composerPopup(page,'选择模型').waitFor({state:'hidden'});
}
export async function chooseComposerWorkflow(page, label) {
 const remove=page.getByRole('button',{name:'移除任务上下文',exact:true});
 if(await remove.isVisible())await remove.click();
 await composerTrigger(page,'添加').click();
 await composerPopup(page,'添加').getByRole('button').filter({hasText:label}).click();
 await composerPopup(page,'添加').waitFor({state:'hidden'});
}
export async function chooseComposerPermission(page, label) {
 await composerTrigger(page,'运行权限模式').click();
 await composerPopup(page,'权限').getByRole('radiogroup',{name:'权限'}).getByRole('radio').filter({hasText:label === '接受编辑' ? '自动接受' : label}).click();
 await composerPopup(page,'权限').waitFor({state:'hidden'});
}
