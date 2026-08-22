"""Persistent JSON-lines bridge for the local Supertonic 3 CPU engine."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import traceback
from typing import Any

from supertonic import TTS


_tts: TTS | None = None


def engine() -> TTS:
    global _tts
    if _tts is None:
        # Keep ONNX CPU usage responsive without taking every core from the editor.
        threads = max(1, min(4, (os.cpu_count() or 2) // 2))
        _tts = TTS(
            model="supertonic-3",
            auto_download=True,
            intra_op_num_threads=threads,
            inter_op_num_threads=1,
        )
    return _tts


def synthesize(payload: dict[str, Any]) -> dict[str, Any]:
    text = str(payload.get("text", "")).strip()
    voice = str(payload.get("voice", "")).strip().upper()
    if not text:
        raise ValueError("Văn bản không được để trống")
    if voice not in {f"{gender}{index}" for gender in ("M", "F") for index in range(1, 6)}:
        raise ValueError("Giọng Supertonic không hợp lệ")

    speed = max(0.7, min(2.0, float(payload.get("rate", 1.0))))
    tts = engine()
    wav, duration = tts.synthesize(
        text=text,
        lang="vi",
        voice_style=tts.get_voice_style(voice_name=voice),
        total_steps=8,
        speed=speed,
    )
    output = tempfile.NamedTemporaryFile(prefix="supertonic-", suffix=".wav", delete=False)
    output.close()
    tts.save_audio(wav, output.name)
    return {"audioPath": output.name, "duration": float(duration[0])}


def handle(payload: dict[str, Any]) -> dict[str, Any]:
    command = payload.get("command")
    if command == "ping":
        return {"ready": True}
    if command == "synthesize":
        return synthesize(payload)
    raise ValueError("Lệnh Supertonic không được hỗ trợ")


def main() -> None:
    for line in sys.stdin:
        request_id: Any = None
        try:
            payload = json.loads(line.lstrip("\ufeff"))
            request_id = payload.get("id")
            result = handle(payload)
            response = {"id": request_id, "success": True, **result}
        except Exception as error:  # keep the worker alive after a bad request
            traceback.print_exc(file=sys.stderr)
            response = {"id": request_id, "success": False, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

