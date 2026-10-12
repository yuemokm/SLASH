# 5页PPT整合记录

交付：`../Slash产品介绍-整合版.pptx`，5页，2,827,345字节，SHA256 `df9dd33b0531bb74661fce96a437ab97a14e6858cb5a96dd813095d578249453`。

顺序：1保留架构，2新增Slash/Pi/LLM协作图，3合并模型与Skills/MCP，4保留共享与右侧文件，5保留真实PRD及后续规划。

第2页采用用户选定的AI生成概念协作图，不是软件截图。图片原字节复制到`assets/slash-pi-llm-collaboration.png`，保留比例、全部文字与边界。该页是光栅图片，图内文字和图形不能单独编辑；其余页文字及第1页架构仍为原生可编辑对象。图片SHA256 `bd599a4722b83dd53376ee2e76d3c02b95266fe7fc33ec7f5a605a08bbce97cf`。

第3页保留模型/Skills/MCP三张真实截图及三种协议、官方API/第三方中转、本地/GitHub技能导入、Vercel/Supabase预设、HTTP/stdio自定义连接。官方订阅登录和上游完整模型列表仍明确待接入，不将表单截图称为云账号验收。

第1/4/5源码块未改。包比较中，排除每次导出随机生成的对象creationId，并以被引用媒体哈希归一化关系ID后，三页XML内容完全一致，引用媒体与布局字节哈希也完全一致。证据：`build/integrated-preservation-check.json`。因此复用既有已审页面，无额外重渲。

验证：`build/validation-integrated-v1.json`通过包结构、5页、字体/布局和Artifact Tool重导入检查，无布局警告。第2/3页从最终PPT重导入渲染到`previews-integrated/slide-2.png`及`slide-3.png`并由主代理目视通过。未打开PowerPoint，不宣称原生PowerPoint运行验收。

原修订版保留，SHA256仍为`e359836cfc12673d45ec9fc899eb38a4d6c1429526108dcc029d9a468f98fd63`。新源码`build/deck-integrated.mjs`，源转换入口`build/merge-insert-source.mjs`。本轮仅修改PPT交付材料，未执行视频/TTS、应用构建或打包、依赖安装及产品源码改动。
