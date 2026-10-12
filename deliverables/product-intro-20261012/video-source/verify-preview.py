"""Verify the actual exported silent MP4 and its estimated subtitle timeline."""
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
movie = ROOT.parent / 'Slash产品介绍-字幕预览.mp4'
timeline = json.loads((ROOT / 'timeline-preview.json').read_text(encoding='utf-8'))
scenes = json.loads((ROOT / 'narration.json').read_text(encoding='utf-8-sig'))
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(movie)]))
video = next(x for x in probe['streams'] if x['codec_type'] == 'video')
assert (video['width'], video['height'], video['r_frame_rate']) == (1920, 1080, '30/1')
assert video['codec_name'] == 'h264'
assert int(video['nb_frames']) == sum(x['frames'] for x in timeline)
assert abs(float(probe['format']['duration']) - sum(x['frames'] for x in timeline) / 30) < .05
assert not any(x['codec_type'] == 'audio' for x in probe['streams']), 'Silent preview unexpectedly contains audio'
assert len(timeline) == 10
for row, source in zip(timeline, scenes):
    assert row['id'] == source['id']
    assert re.sub(r'\s+', '', ''.join(x['text'] for x in row['captions'])) == re.sub(r'\s+', '', source['text'])
    previous = 0
    for caption in row['captions']:
        assert previous <= caption['startMs'] < caption['endMs'] <= row['frames'] / 30 * 1000
        previous = caption['endMs']
architecture = next(x for x in timeline if x['id'] == 'architecture')
assert architecture['frames'] - architecture['prefixFrames'] >= 900
quality = ROOT.parent / 'video-qc'
quality.mkdir(exist_ok=True)
samples = [('models', 1989), ('permissions', 2512), ('prd', 4580), ('close', 4712)]
for name, frame in samples:
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-ss', str(frame / 30), '-i', str(movie), '-frames:v', '1', '-threads', '1', '-y', str(quality / (name + '.png'))], check=True)
process = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-threads', '1', '-i', str(movie), '-filter_threads', '1', '-vf', 'blackdetect=d=0.4:pix_th=0.08,freezedetect=n=0.0005:d=5', '-an', '-f', 'null', 'NUL'], capture_output=True, text=True, encoding='utf-8', errors='replace')
assert process.returncode == 0, process.stderr
(quality / 'decode-black-freeze.log').write_text(process.stderr, encoding='utf-8')
black_intervals = re.findall(r'black_start:([^\s]+) black_end:([^\s]+) black_duration:([^\s]+)', process.stderr)
assert not black_intervals, 'Unexpected black intervals: ' + str(black_intervals)
summary = {
    'mode': 'silent-subtitle-preview', 'voiceReady': False, 'captionTiming': 'estimated-reading-speed',
    'renderExitCode': 0, 'typecheckExitCode': 0, 'width': video['width'], 'height': video['height'],
    'fps': video['r_frame_rate'], 'codec': video['codec_name'], 'frames': int(video['nb_frames']),
    'durationSeconds': float(probe['format']['duration']), 'audioStreams': 0, 'chapterCount': len(timeline),
    'captionPages': sum(len(x['captions']) for x in timeline), 'approvedNarrationTextMatched': True,
    'architectureDiagramSeconds': (architecture['frames'] - architecture['prefixFrames']) / 30,
    'fullDecodeExitCode': process.returncode, 'blackIntervalsAtLeastPoint4Seconds': black_intervals,
    'freezeEvents': [x for x in process.stderr.splitlines() if 'freeze_' in x],
    'sampleFrames': {name: frame for name, frame in samples},
    'sha256': hashlib.sha256(movie.read_bytes()).hexdigest(), 'sizeBytes': movie.stat().st_size,
}
(ROOT.parent / 'video-preview-verification.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
(quality / 'ffprobe.json').write_text(json.dumps(probe, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
