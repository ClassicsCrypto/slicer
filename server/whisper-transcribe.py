#!/usr/bin/env python3
"""
Local Whisper transcription for Slicer.
Uses faster-whisper with GPU acceleration (RTX 3080).
Outputs JSON with word-level timestamps compatible with Slicer's pipeline.

Usage: python whisper-transcribe.py <audio_file> [--model medium] [--device cuda]
Output: JSON to stdout with { text, words[], duration, language }
"""

import sys
import json
import time
import argparse

def transcribe(audio_path, model_size="medium", device="cuda", compute_type="float16"):
    from faster_whisper import WhisperModel
    
    print(f"[whisper] Loading model: {model_size} on {device} ({compute_type})", file=sys.stderr)
    start = time.time()
    
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    load_time = time.time() - start
    print(f"[whisper] Model loaded in {load_time:.1f}s", file=sys.stderr)
    
    print(f"[whisper] Transcribing: {audio_path}", file=sys.stderr)
    start = time.time()
    
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,  # Skip silence — important for gaming streams
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200,
        ),
    )
    
    # Collect all words and full text
    words = []
    full_text = []
    
    for segment in segments:
        full_text.append(segment.text.strip())
        if segment.words:
            for word in segment.words:
                words.append({
                    "text": word.word.strip(),
                    "start": round(word.start * 1000),  # ms (AssemblyAI format)
                    "end": round(word.end * 1000),       # ms
                    "confidence": round(word.probability, 3),
                })
    
    transcribe_time = time.time() - start
    duration = info.duration
    ratio = duration / transcribe_time if transcribe_time > 0 else 0
    
    print(f"[whisper] Done in {transcribe_time:.1f}s ({ratio:.1f}x realtime)", file=sys.stderr)
    print(f"[whisper] Language: {info.language} ({info.language_probability:.1%})", file=sys.stderr)
    print(f"[whisper] Words: {len(words)}, Duration: {duration:.1f}s", file=sys.stderr)
    
    result = {
        "text": " ".join(full_text),
        "words": words,
        "duration": duration,
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "transcribe_time": round(transcribe_time, 1),
        "realtime_factor": round(ratio, 1),
    }
    
    # Output JSON to stdout
    print(json.dumps(result))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Whisper transcription for Slicer")
    parser.add_argument("audio", help="Path to audio/video file")
    parser.add_argument("--model", default="medium", choices=["tiny", "base", "small", "medium", "large-v3"],
                        help="Whisper model size (default: medium)")
    parser.add_argument("--device", default="cuda", choices=["cuda", "cpu"],
                        help="Device (default: cuda)")
    parser.add_argument("--compute-type", default="float16", 
                        choices=["float16", "int8_float16", "int8"],
                        help="Compute type (default: float16)")
    
    args = parser.parse_args()
    
    try:
        transcribe(args.audio, args.model, args.device, args.compute_type)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
