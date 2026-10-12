import asyncio
from pathlib import Path
import edge_tts
root=Path('deliverables/product-intro-20261012/video-source')
(root/'samples').mkdir(exist_ok=True)
text='斜杠工作台，面向产品经理。底层复用派，承接模型适配和工具循环。先研究，再执行，让资料和成果留在同一个任务里。'
async def main():
 for voice in ['zh-CN-XiaoxiaoNeural','zh-CN-YunxiNeural']:
  await edge_tts.Communicate(text,voice,rate='+5%').save(str(root/'samples'/f'{voice}.mp3'))
  print(voice,flush=True)
asyncio.run(main())
