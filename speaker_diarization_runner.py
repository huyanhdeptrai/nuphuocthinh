"""Run local pyannote speaker diarization and emit normalized JSON."""

from __future__ import annotations

import json
import os
import sys
import time
import warnings
import zipfile

os.environ.setdefault("HF_HUB_OFFLINE", "1")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

warnings.filterwarnings("ignore", message=r"(?s).*torchcodec.*")


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def resolve_local_model(snapshot_download) -> str:
    model_name = "pyannote-speaker-diarization-community-1"
    project_root = os.path.dirname(os.path.abspath(__file__))
    bundled_dir = os.path.join(project_root, "bundled-models", model_name)
    if os.path.isfile(os.path.join(bundled_dir, "config.yaml")):
        return bundled_dir

    bundled_archive = os.path.join(
        project_root,
        "bundled-models",
        f"{model_name}.zip",
    )
    if os.path.isfile(bundled_archive):
        app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.cache")
        extracted_dir = os.path.join(app_data, "Lemyloi-dichvideo", "models", model_name)
        config_path = os.path.join(extracted_dir, "config.yaml")
        if not os.path.isfile(config_path):
            os.makedirs(extracted_dir, exist_ok=True)
            with zipfile.ZipFile(bundled_archive) as archive:
                archive.extractall(extracted_dir)
        if os.path.isfile(config_path):
            return extracted_dir

    try:
        return snapshot_download(
            "pyannote/speaker-diarization-community-1",
            local_files_only=True,
        )
    except Exception as error:
        raise RuntimeError(
            "Không tìm thấy model pyannote đi kèm hoặc trong cache máy."
        ) from error


def load_pipeline():
    model_load_started = time.perf_counter()
    try:
        import numpy as np
        import torch
        from huggingface_hub import snapshot_download
        from pyannote.audio import Pipeline
        from scipy.io import wavfile
    except ImportError as error:
        raise RuntimeError(
            "Chưa cài pyannote.audio. Chạy: "
            "uv pip install --python .venv-diarization/Scripts/python.exe "
            "-r requirements-asr.txt"
        ) from error

    model_path = os.environ.get("PYANNOTE_MODEL_PATH")
    if not model_path:
        model_path = resolve_local_model(snapshot_download)

    pipeline = Pipeline.from_pretrained(model_path)
    if pipeline is None:
        raise RuntimeError("Không thể mở model pyannote cục bộ.")

    raw_step = os.environ.get("PYANNOTE_SEGMENTATION_STEP", "0.1")
    step_ratio = float(raw_step)
    applied_step = apply_segmentation_step(pipeline, step_ratio)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pipeline.to(device)
    device_label = None
    if device.type == "cuda":
        try:
            device_label = torch.cuda.get_device_name(device)
            torch.cuda.synchronize(device)
        except Exception:
            device_label = None
    model_load_ms = round((time.perf_counter() - model_load_started) * 1000, 1)
    return pipeline, device, np, torch, wavfile, model_load_ms, device_label, applied_step


def annotation_to_segments(annotation) -> list[dict]:
    return [
        {
            "startTime": round(float(turn.start), 3),
            "endTime": round(float(turn.end), 3),
            "speaker": str(speaker),
        }
        for turn, _, speaker in annotation.itertracks(yield_label=True)
        if float(turn.end) - float(turn.start) >= 0.08
    ]


def fill_exclusive_gaps(
    exclusive: list[dict],
    regular: list[dict],
    max_gap: float = 0.55,
) -> list[dict]:
    if not exclusive or not regular:
        return exclusive or regular
    filled = sorted(exclusive, key=lambda item: item["startTime"])
    extras: list[dict] = []
    for index, current in enumerate(filled):
        nxt = filled[index + 1] if index + 1 < len(filled) else None
        gap_start = current["endTime"]
        gap_end = nxt["startTime"] if nxt else gap_start
        if nxt is None or gap_end - gap_start < 0.08 or gap_end - gap_start > max_gap:
            continue
        for candidate in regular:
            overlap_start = max(gap_start, candidate["startTime"])
            overlap_end = min(gap_end, candidate["endTime"])
            if overlap_end - overlap_start < 0.08:
                continue
            extras.append(
                {
                    "startTime": round(overlap_start, 3),
                    "endTime": round(overlap_end, 3),
                    "speaker": candidate["speaker"],
                }
            )
    return filled + extras


def merge_speaker_segments(segments: list[dict], gap: float = 0.35) -> list[dict]:
    if not segments:
        return []
    ordered = sorted(segments, key=lambda item: (item["startTime"], item["endTime"]))
    merged = [dict(ordered[0])]
    for segment in ordered[1:]:
        last = merged[-1]
        same_speaker = segment["speaker"] == last["speaker"]
        if same_speaker and segment["startTime"] <= last["endTime"] + gap:
            last["endTime"] = max(last["endTime"], segment["endTime"])
            continue
        merged.append(dict(segment))
    return merged


def apply_segmentation_step(pipeline, step_ratio: float) -> float:
    inference = getattr(pipeline, "_segmentation", None)
    if inference is None:
        return step_ratio
    duration = float(getattr(inference, "duration", 0.0) or 0.0)
    if duration <= 0:
        return step_ratio
    inference.step = max(0.05, min(duration, duration * step_ratio))
    if hasattr(pipeline, "segmentation_step"):
        pipeline.segmentation_step = step_ratio
    return inference.step / duration


def diarize(runtime, audio_path: str, speaker_count: str) -> dict:
    pipeline, device, np, torch, wavfile, _, device_label, applied_step = runtime

    if not os.path.isfile(audio_path):
        raise RuntimeError("Không tìm thấy file âm thanh để phân tích.")

    options: dict[str, int] = {}
    if speaker_count != "auto":
        options["num_speakers"] = max(1, min(10, int(speaker_count)))

    sample_rate, waveform_array = wavfile.read(audio_path)
    if waveform_array.ndim == 1:
        waveform_array = waveform_array[:, np.newaxis]
    if np.issubdtype(waveform_array.dtype, np.integer):
        dtype_info = np.iinfo(waveform_array.dtype)
        scale = float(max(abs(dtype_info.min), dtype_info.max))
        waveform_array = waveform_array.astype(np.float32) / scale
    else:
        waveform_array = waveform_array.astype(np.float32)
    waveform = torch.from_numpy(waveform_array.T.copy())
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    if device.type == "cuda":
        torch.cuda.synchronize(device)
    inference_started = time.perf_counter()
    output = pipeline(
        {"waveform": waveform, "sample_rate": int(sample_rate)},
        **options,
    )
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    inference_ms = round((time.perf_counter() - inference_started) * 1000, 1)
    exclusive = getattr(output, "exclusive_speaker_diarization", None)
    regular = getattr(output, "speaker_diarization", None)
    if exclusive is None:
        exclusive = regular if regular is not None else output
    if regular is None:
        regular = exclusive

    segments = merge_speaker_segments(
        fill_exclusive_gaps(
            annotation_to_segments(exclusive),
            annotation_to_segments(regular),
        )
    )
    result = {
        "success": True,
        "device": str(device),
        "segments": segments,
        "detectedSpeakers": len({segment["speaker"] for segment in segments}),
        "inferenceMs": inference_ms,
        "segmentationStep": applied_step,
    }
    if device_label:
        result["deviceLabel"] = device_label
    return result


def run_worker() -> int:
    try:
        runtime = load_pipeline()
        ready = {
            "ready": True,
            "device": str(runtime[1]),
            "modelLoadMs": runtime[5],
            "segmentationStep": runtime[7],
        }
        if runtime[6]:
            ready["deviceLabel"] = runtime[6]
        emit(ready)
    except Exception as error:
        emit({"ready": False, "success": False, "error": str(error)})
        return 6

    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line.lstrip("\ufeff"))
            request_id = request.get("id")
            result = diarize(
                runtime,
                str(request.get("audioPath", "")),
                str(request.get("speakerCount", "auto")),
            )
            emit({"id": request_id, **result})
        except Exception as error:
            emit({"id": request_id, "success": False, "error": str(error)})
    return 0


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] == "--worker":
        return run_worker()
    if len(sys.argv) < 2:
        emit({"success": False, "error": "Thiếu đường dẫn file âm thanh."})
        return 2

    try:
        runtime = load_pipeline()
        result = diarize(
            runtime,
            sys.argv[1],
            sys.argv[2] if len(sys.argv) > 2 else "auto",
        )
        result["modelLoadMs"] = runtime[5]
        emit(result)
        return 0
    except Exception as error:
        emit({"success": False, "error": str(error)})
        return 6


if __name__ == "__main__":
    raise SystemExit(main())
