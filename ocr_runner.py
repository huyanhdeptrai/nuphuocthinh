"""CLI bridge for local OCR engines and the event-driven video OCR pipeline."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys

# Suppress Paddle & PaddleX logs
os.environ["FLAGS_allocator_strategy"] = "naive_best_fit"
os.environ["GLOG_minloglevel"] = "3"
os.environ["PPOCR_SHOW_LOG"] = "0"
os.environ["PADDLEX_SHOW_LOG"] = "0"

# Force UTF-8 environment for Python on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

real_stdout = sys.__stdout__
sys.stdout = sys.stderr

import cv2
import numpy as np

from ocr_video_pipeline import (
    OCRConfig,
    OpenCVTextDetector,
    ROI,
    TextBox,
    clean_text,
    format_srt,
    process_video,
)


RAPIDOCR_PROFILES = {
    "rapidocr": {
        "model_type": "small",
        "det_model_type": "small",
        "rec_model_type": "small",
        "label": "Small",
        "detector_label": "Small",
        "det_limit_side_len": 736,
        "max_ocr_attempts": 5,
        "detector_scan_fps": 2.0,
    },
    "rapidocr-tiny": {
        "model_type": "tiny",
        "det_model_type": "tiny",
        "rec_model_type": "small",
        "label": "Tiny Det + Small Rec",
        "detector_label": "Tiny",
        "det_limit_side_len": 640,
        "max_ocr_attempts": 2,
        "detector_scan_fps": 1.6,
        "onnx_threads": 4,
        "opencv_threads": 1,
        "min_event_duration_ms": 180,
    },
}


def get_rapidocr_profile(engine: str) -> dict:
    return RAPIDOCR_PROFILES.get(engine, RAPIDOCR_PROFILES["rapidocr"])

def print_json(data: dict) -> None:
    raw_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
    if hasattr(real_stdout, "buffer"):
        real_stdout.buffer.write(raw_bytes + b"\n")
        real_stdout.buffer.flush()
    else:
        real_stdout.write(raw_bytes.decode("utf-8", errors="replace") + "\n")
        real_stdout.flush()

def parse_paddle_result(result):
    lines: list[str] = []
    scores: list[float] = []
    if not isinstance(result, list) or not result:
        return lines, 0.0
    item = result[0]
    if isinstance(item, dict):
        lines = [str(value).strip() for value in item.get("rec_texts", []) if str(value).strip()]
        scores = [float(value) for value in item.get("rec_scores", []) if value is not None]
    elif isinstance(item, list):
        for line in item:
            if isinstance(line, list) and len(line) > 1:
                value = line[1]
                if isinstance(value, (list, tuple)):
                    lines.append(str(value[0]).strip())
                    if len(value) > 1:
                        scores.append(float(value[1]))
                else:
                    lines.append(str(value).strip())
    return lines, (sum(scores) / len(scores) if scores else 0.90)


def _language_has_expected_script(text: str, lang: str) -> bool:
    """Reject high-confidence UI/logo noise that the selected model can spell."""
    if lang not in {"auto", "zh", "ch"}:
        return True
    return any("\u3400" <= char <= "\u9fff" for char in text)


def parse_rapidocr_result(result, lang: str) -> tuple[list[str], float]:
    texts = list(getattr(result, "txts", None) or [])
    scores = list(getattr(result, "scores", None) or [])
    accepted_lines: list[str] = []
    accepted_scores: list[float] = []

    for index, value in enumerate(texts):
        text = str(value).strip()
        score = float(scores[index]) if index < len(scores) else 0.0
        if text and score >= 0.55 and _language_has_expected_script(text, lang):
            accepted_lines.append(text)
            accepted_scores.append(score)

    confidence = sum(accepted_scores) / len(accepted_scores) if accepted_scores else 0.0
    return accepted_lines, confidence


def recognize_rapidocr_crop(
    rapid,
    image,
    lang: str,
) -> tuple[list[str], float]:
    """Use detector + recognizer on a crop, falling back for very tight lines."""
    detected = parse_rapidocr_result(
        rapid(image, use_det=True, use_cls=True, use_rec=True),
        lang,
    )
    if detected[0]:
        return detected
    return parse_rapidocr_result(
        rapid(image, use_det=False, use_cls=True, use_rec=True),
        lang,
    )


def build_rapidocr_pipeline(lang: str, engine: str = "rapidocr"):
    """Build the newest RapidOCR profile supported by the installed runtime."""
    from rapidocr import RapidOCR
    from rapidocr.utils.typings import ModelType, OCRVersion

    language_map = {
        "auto": "ch",
        "zh": "ch",
        "ch": "ch",
        "en": "en",
        "vi": "vi",
        "ja": "japan",
        "ko": "korean",
    }
    model_lang = language_map.get(lang, "ch")
    def create_rapid(profile: dict, ocr_version, model_type):
        rapid_params = {
            "Global.log_level": "error",
            "Global.text_score": 0.55,
            "Det.ocr_version": ocr_version,
            "Det.model_type": model_type,
            "Det.lang_type": model_lang,
            "Det.limit_type": "max",
            "Det.limit_side_len": profile["det_limit_side_len"],
            "Rec.ocr_version": ocr_version,
            "Rec.model_type": model_type,
            "Rec.lang_type": model_lang,
        }
        onnx_threads = profile.get("onnx_threads")
        if onnx_threads:
            cv2.setNumThreads(profile.get("opencv_threads", 1))
            rapid_params.update({
                "EngineConfig.onnxruntime.intra_op_num_threads": onnx_threads,
                "EngineConfig.onnxruntime.inter_op_num_threads": 1,
                "EngineConfig.onnxruntime.enable_cpu_mem_arena": False,
            })
        return RapidOCR(params=rapid_params)

    profile = get_rapidocr_profile(engine)
    preferred_model = profile.get("det_model_type", profile.get("model_type", "small")).upper()
    # RapidOCR releases do not all bundle the same PP-OCR model registry.  Try
    # the requested v6 profile first, then progressively older, portable
    # mobile profiles.  This is intentionally CPU-safe and unrelated to CUDA.
    candidates = [
        ("PPOCRV6", preferred_model),
        ("PPOCRV6", "SMALL"),
        ("PPOCRV5", "MOBILE"),
        ("PPOCRV4", "MOBILE"),
    ]
    rapid = None
    selected_version = ""
    selected_model = ""
    errors: list[str] = []
    attempted: set[tuple[str, str]] = set()
    for version_name, model_name in candidates:
        candidate = (version_name, model_name)
        if candidate in attempted:
            continue
        attempted.add(candidate)
        ocr_version = getattr(OCRVersion, version_name, None)
        model_type = getattr(ModelType, model_name, None)
        if ocr_version is None or model_type is None:
            continue
        try:
            rapid = create_rapid(profile, ocr_version, model_type)
            selected_version = str(getattr(ocr_version, "value", version_name))
            selected_model = str(getattr(model_type, "value", model_name)).title()
            break
        except Exception as error:
            message = str(error)
            errors.append(f"{version_name}/{model_name}: {message}")
            if "unsupported configuration" not in message.lower():
                raise
    if rapid is None:
        detail = "; ".join(errors) or "No compatible OCR model profile was found"
        raise RuntimeError(f"RapidOCR has no supported local model configuration: {detail}")

    def recognize(image):
        return recognize_rapidocr_crop(rapid, image, lang)

    def detect(image):
        output = rapid(image, use_det=True, use_cls=False, use_rec=False)
        polygons = getattr(output, "boxes", None)
        scores = list(getattr(output, "scores", None) or [])
        if polygons is None:
            return []

        height, width = image.shape[:2]
        boxes: list[TextBox] = []
        for index, polygon in enumerate(np.asarray(polygons)):
            if polygon.size < 6:
                continue
            xs = polygon[:, 0].astype(float)
            ys = polygon[:, 1].astype(float)
            left, right = max(0.0, float(xs.min())), min(float(width), float(xs.max()))
            top, bottom = max(0.0, float(ys.min())), min(float(height), float(ys.max()))
            if right - left < 2 or bottom - top < 2:
                continue
            score = float(scores[index]) if index < len(scores) else 1.0
            boxes.append(TextBox(
                x=left / width,
                y=top / height,
                width=(right - left) / width,
                height=(bottom - top) / height,
                polarity="auto",
                score=score,
            ).clamped())
        return boxes

    return recognize, detect, f"RapidOCR {selected_version} {selected_model} ONNX"


def build_recognizer(engine: str, lang: str):
    if engine == "easyocr":
        import easyocr

        language_map = {"auto": "ch_sim", "zh": "ch_sim", "ch": "ch_sim", "en": "en", "vi": "vi", "ja": "ja", "ko": "ko"}
        reader = easyocr.Reader([language_map.get(lang, "ch_sim"), "en"], gpu=False)

        def recognize(image):
            result = reader.readtext(image)
            lines = [str(item[1]).strip() for item in result if len(item) > 1 and str(item[1]).strip()]
            scores = [float(item[2]) for item in result if len(item) > 2]
            return lines, (sum(scores) / len(scores) if scores else 0.0)

        return recognize, "EasyOCR CRAFT"

    if engine in RAPIDOCR_PROFILES:
        try:
            recognize, _detect, name = build_rapidocr_pipeline(lang, engine)
            return recognize, name
        except ImportError:
            engine = "paddleocr"

    from paddleocr import PaddleOCR

    paddle_language_map = {
        "auto": "ch",
        "zh": "ch",
        "ch": "ch",
        "en": "en",
        "vi": "latin",
        "ja": "japan",
        "ko": "korean",
    }
    paddle = PaddleOCR(lang=paddle_language_map.get(lang, "ch"))

    def recognize(image):
        return parse_paddle_result(paddle.predict(image))

    return recognize, "PaddleOCR"


def build_text_detector():
    fallback = OpenCVTextDetector()
    try:
        from paddleocr import TextDetection

        model = TextDetection(model_name="PP-OCRv5_mobile_det")

        def detect(image):
            try:
                result = model.predict(image)
            except Exception:
                return fallback.detect(image)
            height, width = image.shape[:2]
            boxes: list[TextBox] = []
            for page in result or []:
                polygons = page.get("dt_polys", []) if hasattr(page, "get") else []
                scores = page.get("dt_scores", []) if hasattr(page, "get") else []
                for index, polygon in enumerate(polygons):
                    points = list(polygon)
                    if len(points) < 3:
                        continue
                    xs = [float(point[0]) for point in points]
                    ys = [float(point[1]) for point in points]
                    left, right = max(0.0, min(xs)), min(float(width), max(xs))
                    top, bottom = max(0.0, min(ys)), min(float(height), max(ys))
                    if right - left < 2 or bottom - top < 2:
                        continue
                    confidence = float(scores[index]) if index < len(scores) else 1.0
                    boxes.append(
                        TextBox(
                            x=left / width,
                            y=top / height,
                            width=(right - left) / width,
                            height=(bottom - top) / height,
                            polarity="auto",
                            score=confidence,
                        ).clamped(),
                    )
            return boxes

        return detect, "Paddle TextDetection (PP-OCRv5 mobile)"
    except Exception:
        return fallback.detect, "OpenCV Text Detector fallback"


def parse_rois(raw: str | None, encoded: str | None = None) -> list[ROI]:
    if encoded:
        try:
            raw = base64.b64decode(encoded).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as error:
            raise ValueError("Invalid encoded ROI JSON") from error
    if not raw:
        return []
    try:
        values = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError("Invalid ROI JSON") from error
    if not isinstance(values, list):
        raise ValueError("ROI JSON must be an array")
    return [ROI.from_dict(value, index) for index, value in enumerate(values) if isinstance(value, dict)]


def image_to_cues(image_path: str, recognize):
    image = cv2.imread(image_path)
    if image is None:
        raise RuntimeError("Cannot open image for OCR")
    lines, confidence = recognize(image)
    text = clean_text(lines)
    if not text:
        return []
    return [{
        "id": "ocr-1",
        "startTime": 0,
        "endTime": 0.1,
        "text": text,
        "confidence": confidence,
        "source": "ocr",
        "roiId": "full-frame",
    }]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--engine",
        default="rapidocr",
        choices=["paddleocr", "rapidocr", "rapidocr-tiny", "easyocr"],
    )
    parser.add_argument("--video", default="")
    parser.add_argument("--directory", default="")
    parser.add_argument("--image", default="")
    parser.add_argument("--lang", default="ch")
    parser.add_argument("--rois", default="")
    parser.add_argument("--rois-base64", default="")
    parser.add_argument("--detector-fps", type=float, default=None)
    parser.add_argument("--stability-ms", type=int, default=180)
    parser.add_argument("--missing-grace-ms", type=int, default=220)
    parser.add_argument("--stable-fps", type=float, default=None)
    parser.add_argument("--transition-fps", type=float, default=None)
    parser.add_argument("--detect-only", action="store_true")
    args = parser.parse_args()

    video_input = args.video or args.directory

    try:
        if video_input:
            if args.engine in RAPIDOCR_PROFILES:
                try:
                    profile = get_rapidocr_profile(args.engine)
                    recognize, detector, engine_name = build_rapidocr_pipeline(
                        args.lang,
                        args.engine,
                    )
                    detector_name = (
                        f"{engine_name} detector "
                        f"({profile['det_limit_side_len']}px max side)"
                    )
                except ImportError as error:
                    raise RuntimeError(
                        "RapidOCR is not installed. Run: python -m pip install -r requirements-ocr.txt"
                    ) from error
                except RuntimeError:
                    # Original-subtitle sync only needs the cue timing and
                    # geometry, never OCR text. If an old RapidOCR runtime has
                    # no compatible model registry at all, keep this workflow
                    # available with the local detector fallback.
                    if not args.detect_only:
                        raise
                    detector, detector_name = build_text_detector()

                    def recognize(_image):
                        return [], 0.0

                    engine_name = f"{detector_name} compatibility fallback"
            else:
                recognize, engine_name = build_recognizer(args.engine, args.lang)
                detector, detector_name = build_text_detector()
            profile = get_rapidocr_profile(args.engine)
            config = OCRConfig(
                detector_scan_fps=(
                    args.detector_fps
                    if args.detector_fps is not None
                    else profile.get("detector_scan_fps", 2.0)
                ),
                stability_ms=args.stability_ms,
                missing_grace_ms=args.missing_grace_ms,
                min_event_duration_ms=profile.get("min_event_duration_ms", 150),
                stable_scan_fps=args.stable_fps,
                transition_scan_fps_alias=args.transition_fps,
                detector_only=args.detect_only,
                min_ocr_confidence=0.55,
                max_ocr_attempts=0 if args.detect_only else profile["max_ocr_attempts"],
            )
            cues, metrics = process_video(
                video_input,
                parse_rois(args.rois, args.rois_base64),
                recognize,
                config,
                detector,
            )
            metrics["detector"] = detector_name
            print_json({
                "success": True,
                "engine": (
                    f"{detector_name} Fast subtitle event scan"
                    if args.detect_only
                    else f"{engine_name} + {detector_name} Event-driven Video Scan"
                ),
                "cues": [cue.as_dict() for cue in cues],
                "text": " ".join(cue.text for cue in cues),
                "srt": format_srt(cues),
                "metrics": metrics,
            })
            return 0
        if args.image:
            recognize, engine_name = build_recognizer(args.engine, args.lang)
            cues = image_to_cues(args.image, recognize)
            print_json({"success": True, "engine": engine_name, "cues": cues, "text": " ".join(cue["text"] for cue in cues)})
            return 0
        raise ValueError("Provide --video or --image")
    except Exception as error:
        print_json({"success": False, "error": str(error)})
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
