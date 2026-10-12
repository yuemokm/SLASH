import json,pathlib,shutil
root=pathlib.Path(__file__).resolve().parent
shutil.copy2(root/'narration.json',root/'history/narration-edge-draft.json')
rows=[
('intro','Slash · 产品经理的 Agent','这是 Slash，一个给产品经理用的桌面 Agent。参考资料放在项目里，就可以让它帮你整理需求、写需求文档，或者改原型。'),
('architecture','Pi 与 Slash','底层用的是 Pi。接模型、保存会话、调用工具这些基础工作，直接复用它的 SDK。OpenClaw 早期也用过 Pi。Slash 主要补的是桌面操作、文件权限，还有修改记录。'),
('models','模型配置','模型可以自己配。填服务地址、API 密钥和模型 ID，再选协议。官方 API、模型供应商，或者兼容的中转服务，都从这里接入。'),
('skills','导入技能','已有的 Skill，可以从本地文件夹或 GitHub 导入。也可以先用 Skill Creator 写好，再导进来。常用的工作方法，就不用每次重新交代。'),
('permissions','权限与模式','只想先理清思路，就选 Plan。要生成或修改内容，再用 Build。完全访问打开后，可以读取项目外的文件。任务没结束，也能补充要求，待发送的内容会先留在队列里。'),
('smb','共享文件夹','几个人一起改原型，最麻烦的是每人一份，最后还得合版。共享文件夹让大家用同一份项目。碰到修改冲突，还是要核对，不能直接覆盖。'),
('resources','资料和成果','资料和生成的内容，可以在右侧打开。对照着看，哪里不对，就继续在会话里说。修改先留下草稿，确认后再应用。'),
('slash','斜杠指令','输入斜杠，就能选需求文档、原型这些常用任务，也能调用已导入的技能。'),
('prd','试写一份简单 PRD','这里用一个简单需求试一下。先选资料，说明要写什么，再看它给出的内容。生成后，对照原资料，核对关键规则。有需要修改的地方，继续在会话里补充。'),
('close','开发中的 Slash','目前还只能算开发中的版本。复杂需求文档得逐项核对，具体任务也有没做完整的地方，离生产级还有距离。')]
data=[dict(id=i,title=t,text=s) for i,t,s in rows]
(root/'narration.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'SCRIPT.md').write_text('# Slash 产品介绍 · 口语稿\n\n音色待用户确认后生成最终声音。PRD段须绑定真实结果，未生成文件不声称保存成功。\n\n'+'\n\n'.join(f'## {t}\n\n{s}' for _,t,s in rows),encoding='utf-8')
for p in [root/'BRIEF.md',root/'hyperframes/BRIEF.md']:
    s=p.read_text(encoding='utf-8').replace('Slash 产品工作台','Slash · 产品经理的 Agent').replace('工作台','Agent')
    p.write_text(s,encoding='utf-8')
p=root/'hyperframes/index.html'
p.write_text(p.read_text(encoding='utf-8-sig').replace('底层复用 Pi，桌面体验由 Slash 补齐','Pi 负责模型循环，Slash 处理文件与任务'),encoding='utf-8')
