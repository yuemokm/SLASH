"""Build a clearly labelled, silent subtitle preview from the approved script.

Times are reading estimates, never measured or transcribed voice timings.
The measured-voice preparation scripts remain separate and unchanged.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
FPS = 30
rows = json.loads((ROOT / 'narration.json').read_text(encoding='utf-8-sig'))

def chunks(text):
    sentences = re.findall(r'[^。！？]+[。！？]?', text)
    result = []
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) <= 36:
            result.append(sentence)
            continue
        clauses = re.findall(r'[^，；]+[，；]?', sentence)
        line = ''
        for clause in clauses:
            if line and len(line + clause) > 36:
                result.append(line)
                line = ''
            line += clause
        if line:
            result.append(line)
    return result

def stamp(milliseconds):
    t = round(milliseconds)
    return f'{t // 3600000:02}:{t // 60000 % 60:02}:{t // 1000 % 60:02},{t % 1000:03}'

timeline = []
entries = []
offset = 0
caption_dir = ROOT / 'remotion/captions'
caption_dir.mkdir(exist_ok=True)
for row in rows:
    elapsed = 0.4
    captions = []
    for text in chunks(row['text']):
        units = len(re.findall(r'[\u3400-\u9fff]', text)) + 2 * len(re.findall(r'[A-Za-z0-9]+', text))
        duration = max(2.2, units / 4.6 + 0.45)
        start = round(elapsed * 1000)
        end = round((elapsed + duration) * 1000)
        captions.append({'text': text, 'startMs': start, 'endMs': end,
                         'timestampMs': None, 'confidence': None, 'pageBreakAfter': True})
        entries.append((offset + start, offset + end, text))
        elapsed += duration + 0.2
    if re.sub(r'\s+', '', ''.join(x['text'] for x in captions)) != re.sub(r'\s+', '', row['text']):
        raise ValueError('Preview caption text mismatch: ' + row['id'])
    frames = round((elapsed + (1.1 if row['id'] == 'close' else .75)) * FPS)
    entry = {**row, 'duration': frames / FPS, 'frames': frames, 'audio': '', 'captions': captions}
    if row['id'] == 'architecture':
        start = next(x['startMs'] for x in captions if x['text'].startswith('一次任务是这样跑起来的'))
        entry['prefixFrames'] = round(start / 1000 * FPS)
        entry['frames'] = max(frames, entry['prefixFrames'] + 900)
        entry['duration'] = entry['frames'] / FPS
    timeline.append(entry)
    (caption_dir / (row['id'] + '-preview.json')).write_text(json.dumps(captions, ensure_ascii=False, indent=2), encoding='utf-8')
    offset += entry['frames'] / FPS * 1000

(ROOT / 'timeline-preview.json').write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding='utf-8')
code = "import type {Caption} from '@remotion/captions';\nexport type SceneTiming={id:string;title:string;text:string;duration:number;frames:number;audio:string;captions:Caption[];prefixFrames?:number};\n// Silent preview: subtitle times are reading estimates. No voice is attached.\nexport const voiceReady=false;\nexport const timings:SceneTiming[]=" + json.dumps(timeline, ensure_ascii=False, indent=2) + ';\n'
(ROOT / 'remotion/src/timeline.ts').write_text(code, encoding='utf-8')
(ROOT.parent / 'Slash产品介绍-字幕预览.srt').write_text('\n\n'.join(f'{i + 1}\n{stamp(a)} --> {stamp(b)}\n{text}' for i, (a, b, text) in enumerate(entries)), encoding='utf-8-sig')
print('SILENT SUBTITLE PREVIEW', round(offset / 1000, 3), 'seconds', sum(x['frames'] for x in timeline), 'frames', len(entries), 'caption pages')
