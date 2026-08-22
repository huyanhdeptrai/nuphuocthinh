"""Persistent JSON-lines bridge for VieNeu-TTS.

Catalog presets stay on v3 Turbo (ONNX/CPU). Clone / preview accept
``engine`` = ``v2`` (default, VieNeu-TTS-v2 Turbo) or ``v3`` so the user
can compare fidelity. v3/v2 codecs are not interchangeable.
"""

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
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import numpy as np
import soundfile as sf
from vieneu import Vieneu

ROOT = Path(__file__).resolve().parent
ENGINE_ROOT = Path(os.environ.get("EDITKUB_TTS_ENGINE_ROOT", ROOT / ".local-services" / "vieneu"))
DATA_DIR = ENGINE_ROOT / "data"
CUSTOM_VOICES_PATH = DATA_DIR / "custom-voices.json"
V2_CUSTOM_VOICES_PATH = DATA_DIR / "custom-voices-v2.json"
OUTPUT_DIR = DATA_DIR / "outputs"

_tts = None
_clone_tts = None


def _engine():
    global _tts
    if _tts is None:
        _tts = Vieneu(mode="v3turbo", device="cpu", backend="onnx", precision="int8")
        if CUSTOM_VOICES_PATH.exists():
            data = json.loads(CUSTOM_VOICES_PATH.read_text(encoding="utf-8"))
            for name, voice in data.get("presets", {}).items():
                _tts._preset_voices[name] = {
                    "description": voice.get("description", "Giọng clone"),
                    "gender": voice.get("gender", ""),
                    "style": voice.get("style", "tu_nhien"),
                    "speaker_emb": np.asarray(voice["speaker_emb"], dtype=np.float32),
                    "codes": np.asarray(voice["codes"], dtype=np.int64) if voice.get("codes") is not None else None,
                }
    return _tts


def _clone_engine():
    global _clone_tts
    if _clone_tts is None:
        _clone_tts = Vieneu(mode="turbo", device="cpu")
        if V2_CUSTOM_VOICES_PATH.exists():
            data = json.loads(V2_CUSTOM_VOICES_PATH.read_text(encoding="utf-8"))
            for name, voice in data.get("presets", {}).items():
                _clone_tts._preset_voices[name] = {
                    "description": voice.get("description", "Giọng clone VieNeu v2"),
                    "gender": voice.get("gender", ""),
                    "style": voice.get("style", "tu_nhien"),
                    "codes": np.asarray(voice["codes"], dtype=np.float32),
                    "text": voice.get("text", ""),
                }
    return _clone_tts


def _normalize_engine(payload: dict) -> str:
    engine = str(payload.get("engine") or "v2").strip().lower()
    if engine in {"v3", "v3turbo", "v3-turbo"}:
        return "v3"
    return "v2"


def _load_v2_store() -> dict:
    if V2_CUSTOM_VOICES_PATH.exists():
        return json.loads(V2_CUSTOM_VOICES_PATH.read_text(encoding="utf-8"))
    return {"presets": {}}


def _save_v2_store(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    V2_CUSTOM_VOICES_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _load_v3_store() -> dict:
    if CUSTOM_VOICES_PATH.exists():
        return json.loads(CUSTOM_VOICES_PATH.read_text(encoding="utf-8"))
    return {"presets": {}}


def _save_v3_store(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CUSTOM_VOICES_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _voice_exists(name: str) -> bool:
    if name in _load_v2_store().get("presets", {}):
        return True
    if name in _load_v3_store().get("presets", {}):
        return True
    if _tts is not None and name in _tts._preset_voices:
        return True
    if _clone_tts is not None and name in _clone_tts._preset_voices:
        return True
    return name in _engine()._preset_voices


def _save_v2_custom_voice(name: str) -> None:
    voice = _clone_engine()._preset_voices[name]
    codes = np.asarray(voice["codes"], dtype=np.float32).reshape(-1)
    data = _load_v2_store()
    data.setdefault("presets", {})[name] = {
        "description": voice.get("description", "Giọng clone VieNeu v2"),
        "gender": voice.get("gender", ""),
        "style": voice.get("style", "tu_nhien"),
        "codes": [round(float(x), 6) for x in codes],
        "text": voice.get("text", ""),
    }
    _save_v2_store(data)


def _save_v3_custom_voice(name: str) -> None:
    voice = _engine()._preset_voices[name]
    emb = np.asarray(voice["speaker_emb"], dtype=np.float32).reshape(-1)
    codes = voice.get("codes")
    data = _load_v3_store()
    data.setdefault("presets", {})[name] = {
        "description": voice.get("description", "Giọng clone VieNeu v3"),
        "gender": voice.get("gender", ""),
        "style": voice.get("style", "tu_nhien"),
        "speaker_emb": [round(float(x), 6) for x in emb],
        "codes": None if codes is None else np.asarray(codes, dtype=np.int64).tolist(),
    }
    _save_v3_store(data)


def _delete_custom_voice(name: str) -> None:
    v2 = _load_v2_store()
    v2_presets = v2.setdefault("presets", {})
    if name in v2_presets:
        del v2_presets[name]
        _save_v2_store(v2)
        if _clone_tts is not None:
            _clone_tts._preset_voices.pop(name, None)
        return
    if not CUSTOM_VOICES_PATH.exists():
        raise ValueError("Không tìm thấy giọng clone để xóa.")
    data = json.loads(CUSTOM_VOICES_PATH.read_text(encoding="utf-8"))
    presets = data.setdefault("presets", {})
    if name not in presets:
        raise ValueError("Chỉ có thể xóa giọng clone do người dùng tạo.")
    del presets[name]
    CUSTOM_VOICES_PATH.write_text(
        json.dumps(data, ensure_ascii=False),
        encoding="utf-8",
    )
    if _tts is not None:
        _tts._preset_voices.pop(name, None)


def _duration(audio_path: str) -> float:
    info = sf.info(audio_path)
    return float(info.frames) / float(info.samplerate)


def _enroll_v2_voice(name: str, audio_path: str, description: str) -> None:
    engine = _clone_engine()
    embedding = np.asarray(engine.encode_reference(audio_path), dtype=np.float32)
    if embedding.ndim > 1:
        embedding = embedding.reshape(-1)
    if embedding.size != 128:
        raise ValueError("VieNeu v2 không trích được embedding giọng mẫu.")
    engine._preset_voices[name] = {
        "description": description,
        "gender": "",
        "style": "tu_nhien",
        "codes": embedding,
        "text": "",
    }


def _enroll_v3_voice(name: str, audio_path: str, description: str) -> None:
    engine = _engine()
    engine.add_voice(
        name,
        audio_path,
        denoise=True,
        use_ref_codes=True,
        description=description,
        save=False,
    )


def _enroll_voice(engine: str, name: str, audio_path: str, description: str) -> None:
    if engine == "v3":
        _enroll_v3_voice(name, audio_path, description)
        return
    _enroll_v2_voice(name, audio_path, description)


def _drop_preview_voice(engine: str, name: str) -> None:
    if engine == "v3":
        if _tts is not None:
            _tts._preset_voices.pop(name, None)
        return
    if _clone_tts is not None:
        _clone_tts._preset_voices.pop(name, None)


def _synthesize(text: str, voice: str, style: str):
    v2 = _load_v2_store().get("presets", {})
    if voice in v2 or (_clone_tts is not None and voice in _clone_tts._preset_voices):
        engine = _clone_engine()
        wav = engine.infer(text, voice=engine.get_preset_voice(voice))
        return wav, engine.sample_rate
    engine = _engine()
    wav = engine.infer(text, voice=voice, style=style)
    return wav, engine.sample_rate


def handle(payload: dict) -> dict:
    command = payload.get("command")
    if command == "synthesize":
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        wav, sample_rate = _synthesize(
            str(payload["text"]),
            str(payload["voice"]),
            str(payload.get("style") or "tu_nhien"),
        )
        fd, output_path = tempfile.mkstemp(prefix="preview-", suffix=".wav", dir=OUTPUT_DIR)
        os.close(fd)
        sf.write(output_path, wav, sample_rate)
        return {"success": True, "audioPath": output_path}
    if command == "preview_clone":
        audio_path = str(payload["audioPath"])
        duration = _duration(audio_path)
        if not np.isfinite(duration) or duration <= 0:
            raise ValueError("File giọng mẫu không có thời lượng âm thanh hợp lệ.")
        engine = _normalize_engine(payload)
        preview_name = f"__preview_{uuid.uuid4().hex}"
        try:
            _enroll_voice(
                engine,
                preview_name,
                audio_path,
                "Giọng clone VieNeu v3 (nghe thử)" if engine == "v3" else "Giọng clone VieNeu v2 (nghe thử)",
            )
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            wav, sample_rate = _synthesize(
                str(payload.get("text") or "Xin chào, đây là giọng đọc thử cho phần thuyết minh."),
                preview_name,
                str(payload.get("style") or "tu_nhien"),
            )
            fd, output_path = tempfile.mkstemp(prefix="preview-clone-", suffix=".wav", dir=OUTPUT_DIR)
            os.close(fd)
            sf.write(output_path, wav, sample_rate)
            return {
                "success": True,
                "audioPath": output_path,
                "duration": duration,
                "engine": "v3-turbo" if engine == "v3" else "v2-turbo",
            }
        finally:
            _drop_preview_voice(engine, preview_name)
    if command == "clone":
        audio_path = str(payload["audioPath"])
        duration = _duration(audio_path)
        if not np.isfinite(duration) or duration <= 0:
            raise ValueError("File giọng mẫu không có thời lượng âm thanh hợp lệ.")
        name = str(payload["name"]).strip()
        if _voice_exists(name):
            raise ValueError("Tên giọng đã tồn tại trong kho.")
        engine = _normalize_engine(payload)
        if engine == "v3":
            _enroll_v3_voice(name, audio_path, "Giọng clone VieNeu v3")
            _save_v3_custom_voice(name)
            return {"success": True, "name": name, "duration": duration, "engine": "v3-turbo"}
        _enroll_v2_voice(name, audio_path, "Giọng clone VieNeu v2")
        _save_v2_custom_voice(name)
        return {"success": True, "name": name, "duration": duration, "engine": "v2-turbo"}
    if command == "delete_clone":
        name = str(payload["name"]).strip()
        _delete_custom_voice(name)
        return {"success": True, "name": name}
    raise ValueError("Lệnh VieNeu không hợp lệ.")


def main() -> None:
    print(json.dumps({"ready": True}), flush=True)
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
            print(json.dumps({"id": request_id, "success": False, "error": str(exc)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
