"""Persistent JSON-lines bridge for k2-fsa OmniVoice (CUDA, zero-shot clone)."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import traceback
import uuid
from pathlib import Path

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import numpy as np
import soundfile as sf
import torch
from omnivoice import OmniVoice, OmniVoiceGenerationConfig, VoiceClonePrompt

ROOT = Path(__file__).resolve().parent
ENGINE_ROOT = Path(os.environ.get("EDITKUB_TTS_ENGINE_ROOT", ROOT / ".local-services" / "omnivoice"))
DATA_DIR = ENGINE_ROOT / "data"
VOICES_FILE = DATA_DIR / "voices.json"
PROMPT_DIR = DATA_DIR / "prompts"
OUTPUT_DIR = DATA_DIR / "outputs"
SAMPLE_RATE = 24_000
MIN_REF_SECONDS = 3.0
MAX_REF_SECONDS = 10.0
MODEL_ID = "k2-fsa/OmniVoice"

DESIGN_VOICES = [
    {
        "voiceId": "nu_tre",
        "name": "Omni Nữ Trẻ",
        "gender": "female",
        "description": "Giọng nữ trẻ, tự nhiên",
        "instruct": "female, young adult, moderate pitch",
    },
    {
        "voiceId": "nu_tram",
        "name": "Omni Nữ Trầm",
        "gender": "female",
        "description": "Giọng nữ trầm, ấm",
        "instruct": "female, middle-aged, low pitch",
    },
    {
        "voiceId": "nu_thi_tham",
        "name": "Omni Nữ Thì Thầm",
        "gender": "female",
        "description": "Giọng nữ thì thầm",
        "instruct": "female, young adult, whisper",
    },
    {
        "voiceId": "nam_tram",
        "name": "Omni Nam Trầm",
        "gender": "male",
        "description": "Giọng nam trầm",
        "instruct": "male, middle-aged, low pitch",
    },
    {
        "voiceId": "nam_tre",
        "name": "Omni Nam Trẻ",
        "gender": "male",
        "description": "Giọng nam trẻ",
        "instruct": "male, young adult, moderate pitch",
    },
    {
        "voiceId": "thieu_nien",
        "name": "Omni Thiếu Niên",
        "gender": "male",
        "description": "Giọng thiếu niên",
        "instruct": "male, teenager, moderate pitch",
    },
]

_model = None


def _duration(audio_path: str) -> float:
    info = sf.info(audio_path)
    return float(info.frames) / float(info.samplerate)


def _load_store() -> dict:
    if VOICES_FILE.exists():
        return json.loads(VOICES_FILE.read_text(encoding="utf-8"))
    return {"voices": []}


def _save_store(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VOICES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _cloned_voices() -> list[dict]:
    voices = _load_store().get("voices", [])
    return [voice for voice in voices if isinstance(voice, dict) and voice.get("voiceId")]


def _find_cloned(voice_id: str) -> dict | None:
    for voice in _cloned_voices():
        if str(voice.get("voiceId")) == voice_id:
            return voice
    return None


def _find_design(voice_id: str) -> dict | None:
    for voice in DESIGN_VOICES:
        if voice["voiceId"] == voice_id:
            return voice
    return None


def _write_wav(audio) -> str:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    waveform = np.asarray(audio[0] if isinstance(audio, (list, tuple)) else audio)
    fd, output_path = tempfile.mkstemp(prefix="omnivoice-", suffix=".wav", dir=OUTPUT_DIR)
    os.close(fd)
    sf.write(output_path, waveform, SAMPLE_RATE)
    return output_path


def model():
    global _model
    if _model is None:
        if not torch.cuda.is_available():
            raise RuntimeError("OmniVoice cần NVIDIA GPU (CUDA).")
        _model = OmniVoice.from_pretrained(
            MODEL_ID,
            device_map="cuda:0",
            dtype=torch.float16,
        )
    return _model


def _generation_config() -> OmniVoiceGenerationConfig:
    return OmniVoiceGenerationConfig(num_step=16)


def _enroll(name: str, audio_path: str, ref_text: str | None) -> dict:
    duration = _duration(audio_path)
    if not np.isfinite(duration) or duration < MIN_REF_SECONDS or duration > MAX_REF_SECONDS:
        raise ValueError("OmniVoice cần file mẫu từ 3 đến 10 giây.")
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    slug = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in name).strip("-") or "voice"
    prompt_path = PROMPT_DIR / f"{slug}-{uuid.uuid4().hex[:8]}.pt"
    prompt = model().create_voice_clone_prompt(
        ref_audio=audio_path,
        ref_text=ref_text or None,
    )
    prompt.save(str(prompt_path))
    return {
        "voiceId": name,
        "name": name,
        "gender": "unknown",
        "description": "Giọng clone OmniVoice",
        "cloned": True,
        "promptFile": str(prompt_path.relative_to(DATA_DIR)).replace("\\", "/"),
        "duration": duration,
    }


def _synthesize_from_prompt(text: str, prompt_path: Path) -> str:
    if not prompt_path.exists():
        raise ValueError("Không tìm thấy file prompt OmniVoice của giọng này.")
    prompt = VoiceClonePrompt.load(str(prompt_path), map_location="cuda:0")
    audio = model().generate(
        text=text,
        language="Vietnamese",
        voice_clone_prompt=prompt,
        generation_config=_generation_config(),
    )
    return _write_wav(audio)


def _synthesize(text: str, voice_id: str) -> str:
    cloned = _find_cloned(voice_id)
    if cloned:
        return _synthesize_from_prompt(text, DATA_DIR / str(cloned["promptFile"]))
    design = _find_design(voice_id)
    if design is None:
        raise ValueError("Không tìm thấy giọng OmniVoice.")
    audio = model().generate(
        text=text,
        language="Vietnamese",
        instruct=design["instruct"],
        generation_config=_generation_config(),
    )
    return _write_wav(audio)


def handle(payload: dict) -> dict:
    command = payload.get("command")
    if command == "ping":
        return {
            "success": True,
            "cuda": bool(torch.cuda.is_available()),
            "loaded": _model is not None,
        }
    if command == "list":
        voices = [
            {
                "voiceId": voice["voiceId"],
                "name": voice["name"],
                "gender": voice["gender"],
                "description": voice["description"],
                "cloned": False,
            }
            for voice in DESIGN_VOICES
        ]
        for voice in _cloned_voices():
            voices.append(
                {
                    "voiceId": str(voice["voiceId"]),
                    "name": str(voice.get("name") or voice["voiceId"]),
                    "gender": voice.get("gender") or "unknown",
                    "description": voice.get("description") or "Giọng clone OmniVoice",
                    "cloned": True,
                }
            )
        return {"success": True, "voices": voices}
    if command == "preview_clone":
        audio_path = str(payload["audioPath"])
        preview_name = f"__preview_{uuid.uuid4().hex}"
        enrolled = None
        try:
            enrolled = _enroll(
                preview_name,
                audio_path,
                str(payload["refText"]).strip() if payload.get("refText") else None,
            )
            output_path = _synthesize_from_prompt(
                str(payload.get("text") or "Xin chào, đây là giọng đọc thử cho phần thuyết minh."),
                DATA_DIR / enrolled["promptFile"],
            )
            return {
                "success": True,
                "audioPath": output_path,
                "duration": enrolled["duration"],
            }
        finally:
            if enrolled:
                prompt_path = DATA_DIR / enrolled["promptFile"]
                prompt_path.unlink(missing_ok=True)
    if command == "clone":
        name = str(payload["name"]).strip()
        if len(name) < 2:
            raise ValueError("Tên giọng phải có từ 2 ký tự.")
        if _find_cloned(name) or _find_design(name):
            raise ValueError("Tên giọng đã tồn tại trong kho OmniVoice.")
        enrolled = _enroll(
            name,
            str(payload["audioPath"]),
            str(payload["refText"]).strip() if payload.get("refText") else None,
        )
        data = _load_store()
        data.setdefault("voices", []).append(enrolled)
        _save_store(data)
        return {
            "success": True,
            "name": name,
            "voiceId": name,
            "duration": enrolled["duration"],
        }
    if command == "synthesize":
        text = str(payload.get("text") or "").strip()
        voice = str(payload.get("voice") or "").strip()
        if not text:
            raise ValueError("Văn bản không được để trống.")
        if not voice:
            raise ValueError("Chưa chọn giọng OmniVoice.")
        return {"success": True, "audioPath": _synthesize(text, voice)}
    if command == "delete_clone":
        name = str(payload["name"]).strip()
        data = _load_store()
        voices = data.setdefault("voices", [])
        remaining = [voice for voice in voices if str(voice.get("voiceId")) != name]
        if len(remaining) == len(voices):
            raise ValueError("Không tìm thấy giọng clone OmniVoice để xóa.")
        removed = next(voice for voice in voices if str(voice.get("voiceId")) == name)
        prompt_file = removed.get("promptFile")
        if prompt_file:
            (DATA_DIR / str(prompt_file)).unlink(missing_ok=True)
        data["voices"] = remaining
        _save_store(data)
        return {"success": True, "name": name}
    raise ValueError("Lệnh OmniVoice không hợp lệ.")


def main() -> None:
    print(json.dumps({"ready": True, "cuda": bool(torch.cuda.is_available())}), flush=True)
    for line in sys.stdin:
        if not line.strip():
            continue
        request_id = None
        try:
            payload = json.loads(line.lstrip("﻿"))
            request_id = payload.get("id")
            result = handle(payload)
            print(json.dumps({"id": request_id, **result}, ensure_ascii=False), flush=True)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            print(
                json.dumps({"id": request_id, "success": False, "error": str(exc)}, ensure_ascii=False),
                flush=True,
            )


if __name__ == "__main__":
    main()
