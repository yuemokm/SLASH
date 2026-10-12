import type {Caption} from '@remotion/captions';
export type SceneTiming={id:string;title:string;text:string;duration:number;frames:number;audio:string;captions:Caption[];prefixFrames?:number};
// Silent preview: subtitle times are reading estimates. No voice is attached.
export const voiceReady=false;
export const timings:SceneTiming[]=[
  {
    "id": "intro",
    "title": "Slash · 产品经理的 Agent",
    "text": "这是 Slash，一个给产品经理用的桌面 Agent。给它参考资料，就可以让它帮你整理需求、写需求文档，或者改原型。",
    "duration": 12.0,
    "frames": 360,
    "audio": "",
    "captions": [
      {
        "text": "这是 Slash，一个给产品经理用的桌面 Agent。",
        "startMs": 400,
        "endMs": 4546,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "给它参考资料，就可以让它帮你整理需求、写需求文档，或者改原型。",
        "startMs": 4746,
        "endMs": 11065,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  },
  {
    "id": "architecture",
    "title": "Pi 与 Slash",
    "text": "这些基础能力复用了 Pi 的 SDK，能少写一套模型接入和会话管理。OpenClaw 早期也用过 Pi。一次任务是这样跑起来的。你在会话里提出要求，Slash 把相关资料、规则和技能交给 Pi。Pi 调用模型，决定下一步用哪个工具。工具执行前，要先检查模式和文件权限。读到的内容会回给模型，修改则先保存成草稿，经过检查和预览，再由用户确认。任务状态、对话历史和文件版本分别保存，进度和结果回到会话里。",
    "duration": 42.0,
    "frames": 1260,
    "audio": "",
    "captions": [
      {
        "text": "这些基础能力复用了 Pi 的 SDK，能少写一套模型接入和会话管理。",
        "startMs": 400,
        "endMs": 6937,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "OpenClaw 早期也用过 Pi。",
        "startMs": 7137,
        "endMs": 9543,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "一次任务是这样跑起来的。",
        "startMs": 9743,
        "endMs": 12585,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "你在会话里提出要求，Slash 把相关资料、规则和技能交给 Pi。",
        "startMs": 12785,
        "endMs": 18670,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "Pi 调用模型，决定下一步用哪个工具。",
        "startMs": 18870,
        "endMs": 22798,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "工具执行前，要先检查模式和文件权限。",
        "startMs": 22998,
        "endMs": 26926,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "读到的内容会回给模型，修改则先保存成草稿，经过检查和预览，再由用户确认。",
        "startMs": 27126,
        "endMs": 34533,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "任务状态、对话历史和文件版本分别保存，进度和结果回到会话里。",
        "startMs": 34733,
        "endMs": 41052,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ],
    "prefixFrames": 292
  },
  {
    "id": "models",
    "title": "模型配置",
    "text": "模型可以自己配。填服务地址、API 密钥和模型 ID，再选协议。官方 API、模型供应商，或者兼容的中转服务，都从这里接入。",
    "duration": 13.966666666666667,
    "frames": 419,
    "audio": "",
    "captions": [
      {
        "text": "模型可以自己配。",
        "startMs": 400,
        "endMs": 2600,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "填服务地址、API 密钥和模型 ID，再选协议。",
        "startMs": 2800,
        "endMs": 7163,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "官方 API、模型供应商，或者兼容的中转服务，都从这里接入。",
        "startMs": 7363,
        "endMs": 13030,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  },
  {
    "id": "skills",
    "title": "导入技能",
    "text": "已有的 Skill，可以从本地文件夹或 GitHub 导入。也可以先用 Skill Creator 写好，再导进来。常用的工作方法，就不用每次重新交代。",
    "duration": 13.766666666666667,
    "frames": 413,
    "audio": "",
    "captions": [
      {
        "text": "已有的 Skill，可以从本地文件夹或 GitHub 导入。",
        "startMs": 400,
        "endMs": 4763,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "也可以先用 Skill Creator 写好，再导进来。",
        "startMs": 4963,
        "endMs": 8674,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "常用的工作方法，就不用每次重新交代。",
        "startMs": 8874,
        "endMs": 12802,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  },
  {
    "id": "permissions",
    "title": "权限与模式",
    "text": "只想先理清思路，就选 Plan。要生成或修改内容，再用 Build。完全访问打开后，可以读取项目外的文件。任务没结束，也能补充要求，待发送的内容会先留在队列里。",
    "duration": 17.666666666666668,
    "frames": 530,
    "audio": "",
    "captions": [
      {
        "text": "只想先理清思路，就选 Plan。",
        "startMs": 400,
        "endMs": 3241,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "要生成或修改内容，再用 Build。",
        "startMs": 3441,
        "endMs": 6500,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "完全访问打开后，可以读取项目外的文件。",
        "startMs": 6700,
        "endMs": 10846,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "任务没结束，也能补充要求，待发送的内容会先留在队列里。",
        "startMs": 11046,
        "endMs": 16713,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  },
  {
    "id": "smb",
    "title": "共享文件夹",
    "text": "几个人一起改原型，最麻烦的是每人一份，最后还得合版。共享文件夹让大家用同一份项目。碰到修改冲突，还是要核对，不能直接覆盖。",
    "duration": 14.833333333333334,
    "frames": 445,
    "audio": "",
    "captions": [
      {
        "text": "几个人一起改原型，最麻烦的是每人一份，最后还得合版。",
        "startMs": 400,
        "endMs": 5850,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "共享文件夹让大家用同一份项目。",
        "startMs": 6050,
        "endMs": 9543,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "碰到修改冲突，还是要核对，不能直接覆盖。",
        "startMs": 9743,
        "endMs": 13889,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  },
  {
    "id": "resources",
    "title": "资料和成果",
    "text": "资料和生成的内容，可以在右侧打开。对照着看，哪里不对，就继续在会话里说。修改先留下草稿，确认后再应用。",
    "duration": 12.666666666666666,
    "frames": 380,
    "audio": "",
    "captions": [
      {
        "text": "资料和生成的内容，可以在右侧打开。",
        "startMs": 400,
        "endMs": 4111,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "对照着看，哪里不对，就继续在会话里说。",
        "startMs": 4311,
        "endMs": 8239,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "修改先留下草稿，确认后再应用。",
        "startMs": 8439,
        "endMs": 11715,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  },
  {
    "id": "slash",
    "title": "斜杠指令",
    "text": "输入斜杠，就能选需求文档、原型这些常用任务，也能调用已导入的技能。",
    "duration": 8.1,
    "frames": 243,
    "audio": "",
    "captions": [
      {
        "text": "输入斜杠，就能选需求文档、原型这些常用任务，也能调用已导入的技能。",
        "startMs": 400,
        "endMs": 7154,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  },
  {
    "id": "prd",
    "title": "试写一份简单 PRD",
    "text": "这里用一个简单需求试一下。先选资料，说明要写什么，再看它给出的内容。生成后，还能对照原资料，核对关键规则。没写清的地方，留待确认。有需要修改的内容，继续在会话里补充。",
    "duration": 20.066666666666666,
    "frames": 602,
    "audio": "",
    "captions": [
      {
        "text": "这里用一个简单需求试一下。",
        "startMs": 400,
        "endMs": 3459,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "先选资料，说明要写什么，再看它给出的内容。",
        "startMs": 3659,
        "endMs": 8022,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "生成后，还能对照原资料，核对关键规则。",
        "startMs": 8222,
        "endMs": 12150,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "没写清的地方，留待确认。",
        "startMs": 12350,
        "endMs": 14974,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "有需要修改的内容，继续在会话里补充。",
        "startMs": 15174,
        "endMs": 19102,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  },
  {
    "id": "close",
    "title": "开发中的 Slash",
    "text": "目前还只能算开发中的版本。复杂需求文档得逐项核对，具体任务也有没做完整的地方，离生产级还有距离。",
    "duration": 12.366666666666667,
    "frames": 371,
    "audio": "",
    "captions": [
      {
        "text": "目前还只能算开发中的版本。",
        "startMs": 400,
        "endMs": 3459,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      },
      {
        "text": "复杂需求文档得逐项核对，具体任务也有没做完整的地方，离生产级还有距离。",
        "startMs": 3659,
        "endMs": 11065,
        "timestampMs": null,
        "confidence": null,
        "pageBreakAfter": true
      }
    ]
  }
];
