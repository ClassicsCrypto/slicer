#!/usr/bin/env python3
"""
Whisper transcription for Slicer using Groq's free Whisper API.
Handles chunking for files >25MB.
Outputs JSON with word-level timestamps.

Usage: python whisper-transcribe.py <audio_file> [--groq-key KEY]
Output: JSON to stdout
"""

import sys
import json
import time
import argparse
import os
import subprocess
import tempfile
import requests

MAX_FILE_SIZE = 24 * 1024 * 1024  # 24MB (under 25MB limit)
CHUNK_DURATION_SEC = 20 * 60  # 20 minutes per chunk

def get_audio_duration(file_path):
    """Get duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file_path],
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except:
        return 0

def extract_audio_chunk(input_file, output_file, start_sec, duration_sec):
    """Extract a chunk of audio as WAV 16kHz mono (small file size)."""
    subprocess.run(
        ['ffmpeg', '-ss', str(start_sec), '-i', input_file, '-t', str(duration_sec),
         '-ar', '16000', '-ac', '1', '-y', output_file],
        capture_output=True, timeout=120
    )

def transcribe_chunk(audio_path, groq_key, offset_ms=0):
    """Transcribe a single audio chunk via Groq Whisper API."""
    with open(audio_path, 'rb') as f:
        resp = requests.post(
            'https://api.groq.com/openai/v1/audio/transcriptions',
            headers={'Authorization': f'Bearer {groq_key}'},
            files={'file': (os.path.basename(audio_path), f, 'audio/wav')},
            data={
                'model': 'whisper-large-v3',
                'response_format': 'verbose_json',
                'timestamp_granularities[]': 'word',
                'language': 'en',
            },
            timeout=300,
        )
    
    if not resp.ok:
        raise Exception(f"Groq API error {resp.status_code}: {resp.text[:200]}")
    
    data = resp.json()
    words = []
    for w in data.get('words', []):
        words.append({
            'text': w.get('word', ''),
            'start': round((w.get('start', 0) * 1000) + offset_ms),  # Convert to ms + offset
            'end': round((w.get('end', 0) * 1000) + offset_ms),
            'confidence': round(w.get('probability', 0.9), 3),
        })
    
    return {
        'text': data.get('text', ''),
        'words': words,
        'duration': data.get('duration', 0),
    }

def transcribe(audio_path, groq_key):
    start_time = time.time()
    total_duration = get_audio_duration(audio_path)
    print(f"[whisper] Audio duration: {total_duration:.1f}s ({total_duration/60:.1f}min)", file=sys.stderr)
    
    file_size = os.path.getsize(audio_path)
    
    # Check if we need to chunk
    if file_size <= MAX_FILE_SIZE and total_duration <= CHUNK_DURATION_SEC:
        # Single file, direct transcription
        print(f"[whisper] Single chunk transcription ({file_size/1024/1024:.1f}MB)", file=sys.stderr)
        
        # Convert to WAV if not already
        if not audio_path.endswith('.wav'):
            wav_path = tempfile.mktemp(suffix='.wav')
            extract_audio_chunk(audio_path, wav_path, 0, total_duration + 1)
            
            # Check if WAV is still too big
            if os.path.getsize(wav_path) > MAX_FILE_SIZE:
                os.unlink(wav_path)
                # Fall through to chunking
            else:
                result = transcribe_chunk(wav_path, groq_key)
                os.unlink(wav_path)
                elapsed = time.time() - start_time
                result['transcribe_time'] = round(elapsed, 1)
                result['realtime_factor'] = round(total_duration / elapsed, 1) if elapsed > 0 else 0
                result['duration'] = total_duration
                print(f"[whisper] Done in {elapsed:.1f}s ({result['realtime_factor']}x realtime)", file=sys.stderr)
                print(json.dumps(result))
                return
    
    # Chunked transcription
    num_chunks = max(1, int(total_duration / CHUNK_DURATION_SEC) + 1)
    print(f"[whisper] Chunking into {num_chunks} segments of ~{CHUNK_DURATION_SEC/60:.0f}min", file=sys.stderr)
    
    all_words = []
    all_text = []
    
    for i in range(num_chunks):
        chunk_start = i * CHUNK_DURATION_SEC
        chunk_duration = min(CHUNK_DURATION_SEC, total_duration - chunk_start)
        
        if chunk_duration <= 0:
            break
        
        print(f"[whisper] Chunk {i+1}/{num_chunks}: {chunk_start/60:.1f}min - {(chunk_start+chunk_duration)/60:.1f}min", file=sys.stderr)
        
        wav_path = tempfile.mktemp(suffix='.wav')
        extract_audio_chunk(audio_path, wav_path, chunk_start, chunk_duration)
        
        # If chunk is still too big, split further
        chunk_size = os.path.getsize(wav_path)
        if chunk_size > MAX_FILE_SIZE:
            os.unlink(wav_path)
            # Split this chunk into smaller pieces
            sub_duration = CHUNK_DURATION_SEC // 2
            for j in range(2):
                sub_start = chunk_start + j * sub_duration
                sub_dur = min(sub_duration, total_duration - sub_start)
                if sub_dur <= 0:
                    break
                
                wav_path = tempfile.mktemp(suffix='.wav')
                extract_audio_chunk(audio_path, wav_path, sub_start, sub_dur)
                
                try:
                    result = transcribe_chunk(wav_path, groq_key, offset_ms=int(sub_start * 1000))
                    all_words.extend(result['words'])
                    all_text.append(result['text'])
                except Exception as e:
                    print(f"[whisper] Chunk error: {e}", file=sys.stderr)
                finally:
                    os.unlink(wav_path)
                
                time.sleep(1)  # Rate limit courtesy
        else:
            try:
                result = transcribe_chunk(wav_path, groq_key, offset_ms=int(chunk_start * 1000))
                all_words.extend(result['words'])
                all_text.append(result['text'])
            except Exception as e:
                print(f"[whisper] Chunk error: {e}", file=sys.stderr)
            finally:
                os.unlink(wav_path)
            
            time.sleep(1)  # Rate limit courtesy
    
    elapsed = time.time() - start_time
    final = {
        'text': ' '.join(all_text),
        'words': all_words,
        'duration': total_duration,
        'transcribe_time': round(elapsed, 1),
        'realtime_factor': round(total_duration / elapsed, 1) if elapsed > 0 else 0,
    }
    
    print(f"[whisper] Done in {elapsed:.1f}s ({final['realtime_factor']}x realtime), {len(all_words)} words", file=sys.stderr)
    print(json.dumps(final))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", help="Path to audio/video file")
    parser.add_argument("--groq-key", default=os.environ.get('GROQ_API_KEY', ''), help="Groq API key")
    args = parser.parse_args()
    
    if not args.groq_key:
        print(json.dumps({"error": "GROQ_API_KEY required"}))
        sys.exit(1)
    
    try:
        transcribe(args.audio, args.groq_key)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
