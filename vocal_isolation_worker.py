"""Persistent JSON-lines bridge for local vocal remover.

Uses Spleeter 2stems (vocals vs accompaniment) in the dedicated
Python 3.11 venv at .local-services/vocal-isolation/.venv-spleeter.
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / ".local-services" / "vocal-isolation" / "models" / "spleeter"
OUTPUT_DIR = ROOT / ".local-services" / "vocal-isolation" / "outputs"
os.environ.setdefault("MODEL_PATH", str(MODEL_DIR))

MODEL_ID = "spleeter-2stems"
PARAMS_DESCRIPTOR = "spleeter:2stems"
MODEL_FILENAME = "2stems"

_separator = None
_device = "cpu"
_model_filename = MODEL_FILENAME


def _reply(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _detect_device() -> str:
    try:
        import tensorflow as tf

        gpus = tf.config.list_physical_devices("GPU")
        if gpus:
            return "cuda"
    except Exception:
        pass
    return "cpu"


def _as_2d(audio):
    import numpy as np

    if audio.ndim == 1:
        return audio[:, None]
    return audio


def _match_to_reference(reference, other, other_sr: int, ref_sr: int):
    import numpy as np

    other = _as_2d(other).astype(np.float32, copy=False)
    if other_sr != ref_sr and other_sr > 0 and ref_sr > 0:
        import soxr

        other = soxr.resample(other, other_sr, ref_sr).astype(np.float32)
    if other.shape[1] < reference.shape[1]:
        other = np.repeat(other, reference.shape[1], axis=1)
    elif other.shape[1] > reference.shape[1]:
        other = other[:, : reference.shape[1]]
    length = min(len(reference), len(other))
    return reference[:length], other[:length]


def write_complement(*, source_path: str, known_path: str, dest_path: str) -> str:
    """Write source - known so a missing stem still yields both files."""
    import numpy as np
    import soundfile as sf

    original, source_sr = sf.read(source_path, always_2d=True, dtype="float32")
    known, known_sr = sf.read(known_path, always_2d=True, dtype="float32")
    original = _as_2d(original).astype(np.float32, copy=False)
    original, known = _match_to_reference(original, known, known_sr, source_sr)
    complement = original - known
    peak = float(np.max(np.abs(complement))) if complement.size else 0.0
    if peak > 1.0:
        complement = complement / peak
    sf.write(dest_path, complement, source_sr, subtype="PCM_16")
    return dest_path


def _engine():
    global _separator, _device, _model_filename
    if _separator is not None:
        return _separator

    from spleeter.separator import Separator

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    _device = _detect_device()
    # Pool + stdin JSON-lines deadlocks on Windows.
    _separator = Separator(PARAMS_DESCRIPTOR, multiprocess=False)
    _model_filename = MODEL_FILENAME
    return _separator


def _separate(audio_path: str) -> dict:
    import numpy as np
    import soundfile as sf

    source = Path(audio_path)
    if not source.is_file():
        raise FileNotFoundError(f"Không tìm thấy file âm thanh: {audio_path}")
    suffix = source.suffix.lower()
    if suffix not in {".wav", ".wave"}:
        raise ValueError("Chỉ nhận WAV đã trích xuất, không nhận video.")

    started = time.perf_counter()
    token = f"{source.stem}-{os.getpid()}-{int(time.time() * 1000)}"
    original, source_sr = sf.read(str(source), always_2d=True, dtype="float32")
    original = _as_2d(original).astype(np.float32, copy=False)

    target_sr = 44100
    waveform = original
    if source_sr != target_sr and source_sr > 0:
        import soxr

        waveform = soxr.resample(original, source_sr, target_sr).astype(np.float32)

    sources = _engine().separate(waveform, str(source))
    inference_ms = int((time.perf_counter() - started) * 1000)

    vocals = sources.get("vocals")
    accompaniment = sources.get("accompaniment")
    if vocals is None and accompaniment is None:
        raise RuntimeError("Spleeter không trả stem nào.")

    vocals_path = str(OUTPUT_DIR / f"{token}-vocals.wav")
    instrumental_path = str(OUTPUT_DIR / f"{token}-instrumental.wav")

    if vocals is not None:
        vocals_audio = _as_2d(np.asarray(vocals, dtype=np.float32))
        if source_sr != target_sr and source_sr > 0:
            import soxr

            vocals_audio = soxr.resample(vocals_audio, target_sr, source_sr).astype(
                np.float32
            )
        _, vocals_audio = _match_to_reference(
            original, vocals_audio, source_sr, source_sr
        )
        sf.write(vocals_path, vocals_audio, source_sr, subtype="PCM_16")
    if accompaniment is not None:
        inst_audio = _as_2d(np.asarray(accompaniment, dtype=np.float32))
        if source_sr != target_sr and source_sr > 0:
            import soxr

            inst_audio = soxr.resample(inst_audio, target_sr, source_sr).astype(
                np.float32
            )
        _, inst_audio = _match_to_reference(original, inst_audio, source_sr, source_sr)
        sf.write(instrumental_path, inst_audio, source_sr, subtype="PCM_16")

    if accompaniment is None and vocals is not None:
        write_complement(
            source_path=str(source),
            known_path=vocals_path,
            dest_path=instrumental_path,
        )
    elif vocals is None and accompaniment is not None:
        write_complement(
            source_path=str(source),
            known_path=instrumental_path,
            dest_path=vocals_path,
        )

    if not Path(vocals_path).is_file() or not Path(instrumental_path).is_file():
        raise RuntimeError("Worker tách giọng không trả đủ 2 stem.")

    return {
        "vocalsPath": vocals_path,
        "instrumentalPath": instrumental_path,
        "device": _device,
        "model": MODEL_ID,
        "modelFilename": _model_filename,
        "inferenceMs": inference_ms,
    }


def _handle(payload: dict) -> dict:
    command = str(payload.get("command") or "").strip().lower()
    if command == "ping":
        _engine()
        return {
            "success": True,
            "ready": True,
            "device": _device,
            "model": MODEL_ID,
        }
    if command == "separate":
        audio_path = str(payload.get("audioPath") or "").strip()
        if not audio_path:
            raise ValueError("Thiếu audioPath.")
        result = _separate(audio_path)
        return {"success": True, **result}
    raise ValueError(f"Lệnh không hợp lệ: {command or '(trống)'}")


def main() -> None:
    _reply({"ready": True, "device": _detect_device()})
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        request_id = None
        try:
            payload = json.loads(line)
            if not isinstance(payload, dict):
                raise ValueError("Payload phải là object JSON.")
            request_id = payload.get("id")
            result = _handle(payload)
            if request_id is not None:
                result["id"] = request_id
            _reply(result)
        except Exception as error:
            _reply(
                {
                    "id": request_id,
                    "success": False,
                    "error": str(error),
                    "trace": traceback.format_exc(),
                }
            )


if __name__ == "__main__":
    main()
