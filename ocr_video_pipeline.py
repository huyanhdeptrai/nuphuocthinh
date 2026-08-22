"""Detector-first, event-driven local OCR pipeline for video subtitles.

Architecture:
  Tier A (Fast Scanner): OpenCV/NumPy lightweight text mask extraction & event tracking (No OCR calls).
  Tier B (Heavy OCR): Triggered ONCE per closed text event on best frame / temporal ink fusion image.

Pipeline Flow:
  VIDEO -> ROI -> PRESCAN -> FAST TEXT CHANGE SCANNER -> TEMPORAL INK FUSION -> TEXT EVENT
        -> SELECT BEST FRAME / FUSED IMAGE -> OCR ONCE -> CUES (Text + Start + End)
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from math import ceil
import re
import time
import unicodedata
from typing import Callable, Iterable, Any

import cv2
import numpy as np


@dataclass(frozen=True)
class ROI:
    id: str
    x: float
    y: float
    width: float
    height: float
    enabled: bool = True

    @staticmethod
    def from_dict(value: dict, index: int) -> "ROI":
        def clamp(number: object, minimum: float, maximum: float) -> float:
            try:
                return max(minimum, min(maximum, float(number)))
            except (TypeError, ValueError):
                return minimum

        x = clamp(value.get("x", 0), 0, 1)
        y = clamp(value.get("y", 0), 0, 1)
        width = clamp(value.get("width", 1), 0.01, 1 - x)
        height = clamp(value.get("height", 1), 0.01, 1 - y)
        return ROI(
            id=str(value.get("id") or f"roi-{index + 1}"),
            x=x,
            y=y,
            width=width,
            height=height,
            enabled=value.get("enabled", True) is not False,
        )


@dataclass(frozen=True)
class OCRConfig:
    """Configuration for the fast scanner, temporal fusion, and event tracking pipeline."""

    normal_scan_fps: float = 4.0
    idle_scan_fps: float = 2.0
    transition_scan_fps: float = 10.0

    # Auto-thresholding & Prescan
    auto_threshold: bool = True
    fallback_threshold: int = 175
    min_component_area: int = 15
    max_component_area_ratio: float = 0.50

    # Event matching & similarity thresholds
    stable_similarity: float = 0.92
    same_event_iou: float = 0.35
    reveal_added_ratio: float = 0.15
    max_removed_ratio: float = 0.35

    # Hysteresis & Debounce
    transition_confirm_samples: int = 2
    stability_ms: int = 180
    min_event_duration_ms: int = 150
    missing_grace_ms: int = 250
    boundary_history_ms: int = 1200

    # Temporal Fusion & Watermark
    fusion_enabled: bool = True
    fusion_persistence_min: int = 2
    static_mask_enabled: bool = True
    static_threshold_ratio: float = 0.80

    # Resolution & OCR Limits
    scanner_max_width: int = 480
    max_ocr_attempts: int = 1
    min_ocr_confidence: float = 0.0
    ocr_candidate_interval_ms: int = 120
    ocr_candidate_buffer_size: int = 24

    # Input-compatible aliases
    detector_scan_fps: float = 4.0
    stable_scan_fps: float | None = None
    transition_scan_fps_alias: float | None = None
    detector_only: bool = False

    @property
    def effective_normal_fps(self) -> float:
        # detector_scan_fps is the public CLI/API setting. The previous order
        # silently ignored it because normal_scan_fps always has a default.
        val = self.stable_scan_fps or self.detector_scan_fps or self.normal_scan_fps
        return max(0.5, val)


@dataclass
class Cue:
    id: str
    startTime: float
    endTime: float
    text: str
    confidence: float
    source: str = "ocr"
    roiId: str | None = None
    bounds: dict[str, float] | None = None

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "startTime": round(self.startTime, 3),
            "endTime": round(self.endTime, 3),
            "text": self.text,
            "confidence": round(self.confidence, 3),
            "source": self.source,
            "roiId": self.roiId,
            "bounds": self.bounds,
        }


@dataclass(frozen=True)
class TextBox:
    """Normalized bounding box inside an ROI."""

    x: float
    y: float
    width: float
    height: float
    polarity: str = "light"
    score: float = 1.0

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2

    def clamped(self) -> "TextBox":
        x = min(1.0, max(0.0, self.x))
        y = min(1.0, max(0.0, self.y))
        width = min(1.0 - x, max(0.001, self.width))
        height = min(1.0 - y, max(0.001, self.height))
        return TextBox(x, y, width, height, self.polarity, self.score)

    def iou(self, other: "TextBox") -> float:
        left = max(self.x, other.x)
        top = max(self.y, other.y)
        right = min(self.right, other.right)
        bottom = min(self.bottom, other.bottom)
        intersection = max(0.0, right - left) * max(0.0, bottom - top)
        if intersection == 0:
            return 0.0
        union = self.width * self.height + other.width * other.height - intersection
        return intersection / union if union else 0.0

    def union(self, other: "TextBox") -> "TextBox":
        left = min(self.x, other.x)
        top = min(self.y, other.y)
        right = max(self.right, other.right)
        bottom = max(self.bottom, other.bottom)
        return TextBox(
            left,
            top,
            right - left,
            bottom - top,
            self.polarity,
            max(self.score, other.score),
        ).clamped()


# ============================================================================
# HELPER UTILITIES
# ============================================================================

def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    return re.sub(r"[\s\u200b\ufeff]+", "", value)


def text_similarity(left: str, right: str) -> float:
    left_norm = normalize_text(left)
    right_norm = normalize_text(right)
    if not left_norm or not right_norm:
        return 0.0
    if left_norm == right_norm:
        return 1.0
    return SequenceMatcher(None, left_norm, right_norm).ratio()


def clean_text(lines: Iterable[str]) -> str:
    seen: set[str] = set()
    result: list[str] = []
    for line in lines:
        cleaned = re.sub(r"\s+", " ", str(line)).strip()
        key = normalize_text(cleaned)
        if key and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return "\n".join(result)


def crop_roi(frame: np.ndarray, roi: ROI) -> np.ndarray:
    height, width = frame.shape[:2]
    x1, y1 = int(roi.x * width), int(roi.y * height)
    x2 = max(x1 + 1, int((roi.x + roi.width) * width))
    y2 = max(y1 + 1, int((roi.y + roi.height) * height))
    return frame[y1:min(y2, height), x1:min(x2, width)]


def to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def sharpness(image: np.ndarray) -> float:
    if image.size == 0:
        return 0.0
    return float(cv2.Laplacian(to_gray(image), cv2.CV_64F).var())


# ============================================================================
# PRESCAN & STATIC MASK DETECTION
# ============================================================================

class TextPrescanner:
    """Pre-scans sample frames to estimate text brightness thresholds and detect static watermarks."""

    def __init__(self, config: OCRConfig) -> None:
        self.config = config

    def prescan(self, capture: cv2.VideoCapture, rois: list[ROI], sample_count: int = 30) -> dict[str, Any]:
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if total_frames <= 0:
            return {"threshold": self.config.fallback_threshold, "static_masks": {}}

        step = max(1, total_frames // sample_count)
        samples: dict[str, list[np.ndarray]] = {roi.id: [] for roi in rois if roi.enabled}

        for idx in range(0, total_frames, step):
            capture.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            for roi in rois:
                if roi.enabled:
                    cropped = crop_roi(frame, roi)
                    if cropped.size > 0:
                        samples[roi.id].append(to_gray(cropped))

        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)  # Reset capture stream

        roi_stats: dict[str, Any] = {}
        for roi_id, frame_list in samples.items():
            if not frame_list:
                continue

            # Estimate brightness threshold (e.g. 85th percentile of grayscale)
            all_pixels = np.concatenate([f.ravel() for f in frame_list])
            estimated_thresh = int(np.percentile(all_pixels, 85)) if all_pixels.size > 0 else self.config.fallback_threshold
            estimated_thresh = max(150, min(230, estimated_thresh))

            # Detect static watermark mask (pixels active in >= static_threshold_ratio of frames)
            binary_masks = [cv2.threshold(f, estimated_thresh, 255, cv2.THRESH_BINARY)[1] for f in frame_list]
            accumulated = np.mean(binary_masks, axis=0) if binary_masks else np.zeros_like(frame_list[0])
            static_mask = (accumulated >= (self.config.static_threshold_ratio * 255)).astype(np.uint8) * 255

            roi_stats[roi_id] = {
                "threshold": estimated_thresh,
                "static_mask": static_mask,
                "static_density": float(np.count_nonzero(static_mask)) / static_mask.size if static_mask.size else 0.0,
            }

        return roi_stats


# ============================================================================
# LIGHTWEIGHT TEXT MASK EXTRACTOR
# ============================================================================

class TextMaskExtractor:
    """Creates lightweight binary text masks using fast OpenCV operations."""

    def __init__(self, threshold: int, static_mask: np.ndarray | None = None, config: OCRConfig | None = None) -> None:
        self.threshold = threshold
        self.static_mask = static_mask
        self.config = config or OCRConfig()

    def extract_mask(self, image: np.ndarray, polarity: str = "light") -> np.ndarray:
        gray = to_gray(image)
        if gray.size == 0:
            return gray

        # Downscale for scanner efficiency if needed
        h, w = gray.shape[:2]
        if w > self.config.scanner_max_width:
            scale = self.config.scanner_max_width / w
            gray = cv2.resize(gray, (self.config.scanner_max_width, int(h * scale)), interpolation=cv2.INTER_AREA)

        # Thresholding
        if polarity == "dark":
            _, mask = cv2.threshold(gray, min(110, max(20, int(np.percentile(gray, 20)))), 255, cv2.THRESH_BINARY_INV)
        else:
            _, mask = cv2.threshold(gray, self.threshold, 255, cv2.THRESH_BINARY)

        # Subtract persistent static watermark mask if available
        if self.static_mask is not None and self.static_mask.size > 0:
            resized_static = cv2.resize(self.static_mask, (mask.shape[1], mask.shape[0]), interpolation=cv2.INTER_NEAREST)
            mask = cv2.bitwise_and(mask, cv2.bitwise_not(resized_static))

        # Morphology & Noise filtering
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 2))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        # Connected component filtering to remove tiny noise and huge blobs
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
        clean_mask = np.zeros_like(mask)
        img_area = mask.shape[0] * mask.shape[1]

        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            box_w = stats[i, cv2.CC_STAT_WIDTH]
            box_h = stats[i, cv2.CC_STAT_HEIGHT]

            if area < self.config.min_component_area or area > (img_area * self.config.max_component_area_ratio):
                continue
            aspect_ratio = box_w / max(1, box_h)
            if aspect_ratio > 30 or aspect_ratio < 0.05:
                continue

            clean_mask[labels == i] = 255

        return clean_mask


# ============================================================================
# TEMPORAL INK FUSION
# ============================================================================

class TemporalInkFusion:
    """Accumulates text glyphs across time for reveal/typewriter subtitles to construct a clean composite image."""

    def __init__(self, persistence_min: int = 2) -> None:
        self.persistence_min = persistence_min
        self.accumulated_mask: np.ndarray | None = None
        self.persistence_map: np.ndarray | None = None
        self.best_highres_crop: np.ndarray | None = None
        self.best_sharpness: float = -1.0

    def update(self, mask: np.ndarray, highres_crop: np.ndarray) -> None:
        if self.accumulated_mask is None or self.accumulated_mask.shape != mask.shape:
            self.accumulated_mask = mask.copy()
            self.persistence_map = (mask > 0).astype(np.int32)
        else:
            self.accumulated_mask = cv2.bitwise_or(self.accumulated_mask, mask)
            self.persistence_map += (mask > 0).astype(np.int32)

        crop_sharpness = sharpness(highres_crop)
        if crop_sharpness > self.best_sharpness:
            self.best_sharpness = crop_sharpness
            self.best_highres_crop = highres_crop.copy()

    def get_fused_image(self) -> np.ndarray | None:
        if self.best_highres_crop is None:
            return None
        if self.accumulated_mask is None or self.persistence_map is None:
            return self.best_highres_crop

        # Filter out transient noise pixels appearing fewer than persistence_min times
        filtered_mask = ((self.accumulated_mask > 0) & (self.persistence_map >= self.persistence_min)).astype(np.uint8) * 255
        if np.count_nonzero(filtered_mask) == 0:
            return self.best_highres_crop

        # Resize fused mask to match high-res crop dimensions
        h_hr, w_hr = self.best_highres_crop.shape[:2]
        hr_mask = cv2.resize(filtered_mask, (w_hr, h_hr), interpolation=cv2.INTER_NEAREST)

        # Composite: High-res text foreground on neutral background
        fused = self.best_highres_crop.copy()
        if fused.ndim == 3:
            hr_mask_3d = cv2.merge([hr_mask, hr_mask, hr_mask])
            fused = cv2.bitwise_and(fused, hr_mask_3d)
        else:
            fused = cv2.bitwise_and(fused, hr_mask)

        return fused


# ============================================================================
# FAST OPEN-CV FALLBACK DETECTOR & TEXT DETECTOR
# ============================================================================

class OpenCVTextDetector:
    """Fast local fallback detector for installations without Paddle detection."""

    def detect(self, image: np.ndarray) -> list[TextBox]:
        gray = to_gray(image)
        if gray.size == 0:
            return []
        height, width = gray.shape[:2]
        min_width = max(10, int(width * 0.035))
        min_height = max(5, int(height * 0.018))
        candidates: list[TextBox] = []

        for polarity in ("light", "dark"):
            extractor = TextMaskExtractor(threshold=175)
            mask = extractor.extract_mask(gray, polarity)
            join_kernel = cv2.getStructuringElement(
                cv2.MORPH_RECT,
                (max(3, min(31, int(width * 0.035))), max(1, min(4, int(height * 0.02)))),
            )
            connected = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, join_kernel)
            contours, _ = cv2.findContours(connected, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                x, y, box_w, box_h = cv2.boundingRect(contour)
                if box_w < min_width or box_h < min_height or box_h > height * 0.55:
                    continue
                density = float(np.count_nonzero(mask[y : y + box_h, x : x + box_w])) / max(1, box_w * box_h)
                if density < 0.008 or density > 0.72:
                    continue

                candidates.append(
                    TextBox(
                        x=x / width,
                        y=y / height,
                        width=box_w / width,
                        height=box_h / height,
                        polarity=polarity,
                        score=1.0 - abs(density - 0.18),
                    ).clamped()
                )

        return _group_text_boxes(candidates)


def _boxes_belong_together(left: TextBox, right: TextBox) -> bool:
    if left.polarity != right.polarity:
        return False
    horizontal_gap = max(left.x, right.x) - min(left.right, right.right)
    vertical_gap = max(left.y, right.y) - min(left.bottom, right.bottom)
    height_ratio = max(left.height, right.height) / max(0.001, min(left.height, right.height))
    same_line = (
        height_ratio <= 2.5
        and abs(left.center_y - right.center_y) <= max(left.height, right.height) * 0.8
        and horizontal_gap <= max(0.035, max(left.height, right.height) * 3)
    )
    overlap_x = max(0.0, min(left.right, right.right) - max(left.x, right.x))
    two_lines = (
        height_ratio <= 2.5
        and vertical_gap <= max(left.height, right.height) * 1.8
        and overlap_x >= min(left.width, right.width) * 0.18
    )
    return same_line or two_lines


def _group_text_boxes(boxes: list[TextBox]) -> list[TextBox]:
    groups: list[TextBox] = []
    for box in sorted(boxes, key=lambda item: (item.polarity, item.y, item.x)):
        for index, group in enumerate(groups):
            if _boxes_belong_together(group, box):
                groups[index] = group.union(box)
                break
        else:
            groups.append(box)

    result: list[TextBox] = []
    for box in groups:
        duplicate_index = next(
            (
                index
                for index, existing in enumerate(result)
                # A light outline and dark shadow around the same burned-in
                # subtitle can be reported as two boxes. Keep the best one
                # before temporal tracking, regardless of polarity.
                if existing.iou(box) >= 0.65
            ),
            None,
        )
        if duplicate_index is None:
            result.append(box)
        elif box.score > result[duplicate_index].score:
            result[duplicate_index] = box
    return result


Detector = Callable[[np.ndarray], list[TextBox]]
Recognizer = Callable[[np.ndarray], tuple[list[str], float]]


# ============================================================================
# TEXT EVENT TRACKER & STATE MACHINE
# ============================================================================

@dataclass
class TextEvent:
    id: str
    roi: ROI
    box: TextBox
    state: str  # EMPTY, CANDIDATE, ACTIVE, CHANGING, ENDING
    candidate_start: float
    last_change: float
    last_seen: float
    fusion: TemporalInkFusion = field(default_factory=TemporalInkFusion)
    last_mask: np.ndarray | None = None
    best_crop: np.ndarray | None = None
    best_sharpness: float = -1.0
    missing_since: float | None = None
    ocr_attempts: int = 0
    active_cue: Cue | None = None
    finished: bool = False
    transition_samples: int = 0
    transition_since: float | None = None
    ocr_candidates: list[tuple[float, float, np.ndarray]] = field(default_factory=list)


@dataclass
class CueCollector:
    cues: list[Cue] = field(default_factory=list)

    def begin(
        self,
        event: TextEvent,
        text: str,
        confidence: float,
        end_time: float | None = None,
        start_time: float | None = None,
    ) -> Cue:
        # event.box is normalized inside its ROI. Persist bounds in source-video
        # coordinates so the editor can map the event back onto its canvas.
        bounds = {
            "x": round(event.roi.x + event.box.x * event.roi.width, 5),
            "y": round(event.roi.y + event.box.y * event.roi.height, 5),
            "width": round(event.box.width * event.roi.width, 5),
            "height": round(event.box.height * event.roi.height, 5),
        }
        cue = Cue(
            id=f"ocr-{len(self.cues) + 1}",
            startTime=event.candidate_start if start_time is None else start_time,
            endTime=event.last_seen if end_time is None else end_time,
            text=text,
            confidence=confidence,
            roiId=event.roi.id,
            bounds=bounds,
        )
        self.cues.append(cue)
        return cue


def select_consensus_reading(readings: list[tuple[str, float]]) -> tuple[str, float]:
    """Choose the repeated OCR reading instead of trusting one sharp frame."""
    if not readings:
        return "", 0.0

    valid = [(text, confidence) for text, confidence in readings if normalize_text(text)]
    if not valid:
        return "", 0.0

    clusters: list[list[tuple[str, float]]] = []
    for reading in valid:
        for cluster in clusters:
            if max(text_similarity(reading[0], other[0]) for other in cluster) >= 0.65:
                cluster.append(reading)
                break
        else:
            clusters.append([reading])

    winner = max(
        clusters,
        key=lambda cluster: (
            len(cluster),
            sum(confidence for _text, confidence in cluster) / len(cluster),
        ),
    )

    length_counts: dict[int, int] = {}
    for text, _confidence in winner:
        length = len(normalize_text(text))
        length_counts[length] = length_counts.get(length, 0) + 1
    modal_length = max(length_counts, key=lambda length: (length_counts[length], length))
    complete = [item for item in winner if len(normalize_text(item[0])) == modal_length]

    def candidate_score(candidate: tuple[str, float]) -> float:
        text, confidence = candidate
        key = normalize_text(text)
        exact_votes = sum(1 for other, _score in complete if normalize_text(other) == key)
        agreement = sum(text_similarity(text, other) for other, _score in complete)
        return confidence + exact_votes * 0.02 + agreement * 0.01

    representative = max(complete, key=candidate_score)
    agreeing_scores = [
        confidence
        for text, confidence in winner
        if text_similarity(representative[0], text) >= 0.75
    ]
    consensus_confidence = sum(agreeing_scores) / len(agreeing_scores)
    return representative[0], consensus_confidence


def select_temporal_candidates(
    candidates: list[tuple[float, float, np.ndarray]],
    limit: int,
) -> list[tuple[float, float, np.ndarray]]:
    """Choose sharp frames across the whole event, not only its final frames."""
    if limit <= 0:
        return []
    if len(candidates) <= limit:
        return list(candidates)

    selected: list[tuple[float, float, np.ndarray]] = []
    count = len(candidates)
    for index in range(limit):
        begin = index * count // limit
        end = max(begin + 1, (index + 1) * count // limit)
        selected.append(max(candidates[begin:end], key=lambda item: item[1]))
    return sorted(selected, key=lambda item: item[0])


class ROITracker:
    """Tracks text state events inside a single ROI using the 2-tier architecture."""

    def __init__(
        self,
        *,
        roi: ROI,
        config: OCRConfig,
        detector: Detector,
        recognize: Recognizer,
        collector: CueCollector,
        threshold: int = 175,
        static_mask: np.ndarray | None = None,
        history_capacity: int = 30,
    ) -> None:
        self.roi = roi
        self.config = config
        self.detector = detector
        self.recognize = recognize
        self.collector = collector
        self.extractor = TextMaskExtractor(threshold=threshold, static_mask=static_mask, config=config)
        self.history: deque[tuple[float, np.ndarray]] = deque(maxlen=history_capacity)
        self.events: list[TextEvent] = []
        self.last_detector_time = float("-inf")
        self.detector_calls = 0
        self.detected_text_groups = 0
        self.ocr_calls = 0
        self.stable_events = 0

    def _record_ocr_candidate(self, event: TextEvent, timestamp: float, crop: np.ndarray) -> None:
        if crop.size == 0:
            return
        crop_sharpness = sharpness(crop)
        interval = self.config.ocr_candidate_interval_ms / 1000.0
        candidates = event.ocr_candidates

        if candidates and timestamp - candidates[-1][0] < interval:
            if crop_sharpness > candidates[-1][1]:
                candidates[-1] = (timestamp, crop_sharpness, crop.copy())
        else:
            candidates.append((timestamp, crop_sharpness, crop.copy()))

        if len(candidates) > self.config.ocr_candidate_buffer_size:
            del candidates[0 : len(candidates) - self.config.ocr_candidate_buffer_size]

    def observe(self, timestamp: float, source_image: np.ndarray) -> None:
        analysis_mask = self.extractor.extract_mask(source_image)
        self.history.append((timestamp, analysis_mask))

        if timestamp - self.last_detector_time >= 1.0 / self.config.effective_normal_fps:
            self.last_detector_time = timestamp
            self._sync_detections(timestamp, source_image)

        # A confirmed replacement can append a new event while this loop runs.
        # Only observe events that existed at the start of this frame.
        for event in list(self.events):
            # A detector miss is handled by the grace-period expiry path. Do
            # not interpret an empty crop as a replacement subtitle.
            if not event.finished and event.missing_since is None:
                self._observe_event(event, timestamp, analysis_mask, source_image)

        self._expire_missing_events(timestamp)

    def _sync_detections(self, timestamp: float, source_image: np.ndarray) -> None:
        raw_detections = self.detector(source_image)
        detections = _group_text_boxes([
            detection.clamped()
            for detection in raw_detections
            if detection.width >= 0.01
            and detection.height >= 0.01
            and not (self.roi.height >= 0.5 and detection.height > 0.15)
        ])
        self.detector_calls += 1
        self.detected_text_groups += len(detections)

        available_events = [e for e in self.events if not e.finished]
        matched_event_ids: set[str] = set()

        for detection in sorted(detections, key=lambda item: item.score, reverse=True):
            candidates = [
                (self._event_match_score(event, detection), event)
                for event in available_events
                if event.id not in matched_event_ids
            ]
            score, matched_event = max(candidates, default=(-1.0, None), key=lambda item: item[0])

            if matched_event is None or score < self.config.same_event_iou:
                self._create_event(timestamp, detection, source_image)
                continue

            if (
                self.config.detector_only
                and matched_event.missing_since is not None
                # A same-frame mask disagreement is not a confirmed absence;
                # wait until the next detector sample before splitting.
                and timestamp - matched_event.missing_since
                >= 0.5 / self.config.effective_normal_fps
            ):
                # A detector-only scan records visual subtitle events, not
                # recognized text. Once a sampled frame has no subtitle, a
                # reappearance in the same box is a new cue even if its
                # geometry is identical to the prior line.
                self._close_event(matched_event, matched_event.missing_since)
                matched_event.finished = True
                matched_event.state = "ENDING"
                self._create_event(timestamp, detection, source_image)
                continue

            # Update bounding box smooth tracker
            matched_event.box = detection
            matched_event.last_seen = timestamp
            matched_event.missing_since = None
            matched_event_ids.add(matched_event.id)

        for event in available_events:
            if event.id not in matched_event_ids and event.missing_since is None:
                event.missing_since = timestamp

    def _event_match_score(self, event: TextEvent, detection: TextBox) -> float:
        iou = event.box.iou(detection)
        same_lane = abs(event.box.center_y - detection.center_y) <= max(0.08, max(event.box.height, detection.height) * 1.5)
        if not same_lane:
            return -1.0
        return iou

    def _create_event(self, timestamp: float, box: TextBox, source_image: np.ndarray) -> None:
        crop = crop_roi(source_image, box)
        mask = self.extractor.extract_mask(crop)
        event = TextEvent(
            id=f"{self.roi.id}-event-{len(self.events) + 1}",
            roi=self.roi,
            box=box,
            state="CANDIDATE",
            candidate_start=timestamp,
            last_change=timestamp,
            last_seen=timestamp,
        )
        event.fusion.update(mask, crop)
        event.last_mask = mask
        event.best_crop = crop.copy()
        event.best_sharpness = sharpness(crop)
        self._record_ocr_candidate(event, timestamp, crop)
        self.events.append(event)

    def _observe_event(self, event: TextEvent, timestamp: float, analysis_mask: np.ndarray, source_image: np.ndarray) -> None:
        crop = crop_roi(source_image, event.box)
        current_mask = self.extractor.extract_mask(crop)

        if event.last_mask is not None and current_mask.size > 0 and event.last_mask.shape == current_mask.shape:
            iou = float(np.count_nonzero(event.last_mask & current_mask)) / max(1, np.count_nonzero(event.last_mask | current_mask))
            old_count = np.count_nonzero(event.last_mask)
            new_count = np.count_nonzero(current_mask)

            # A subtitle disappearing between detector ticks is an absence,
            # not a replacement event made from an empty crop.
            if new_count < max(self.config.min_component_area, old_count * 0.08):
                if event.missing_since is None:
                    event.missing_since = timestamp
                return

            overlap_old = float(np.count_nonzero(event.last_mask & current_mask)) / max(1, old_count)
            added_ratio = float(max(0, new_count - old_count)) / max(1, old_count)
            removed_ratio = float(max(0, old_count - new_count)) / max(1, old_count)

            # Check if this is a typewriter / text reveal effect (old ⊂ new)
            is_text_reveal = (overlap_old >= 0.85 and added_ratio >= self.config.reveal_added_ratio and removed_ratio <= self.config.max_removed_ratio)

            if is_text_reveal:
                # Same event reveal: update fusion ink without closing event
                event.state = "CHANGING"
                event.last_change = timestamp
                event.last_seen = timestamp
                event.fusion.update(current_mask, crop)
                event.last_mask = current_mask
                self._record_ocr_candidate(event, timestamp, crop)
                event.transition_samples = 0
                event.transition_since = None
                return

            if iou >= self.config.stable_similarity:
                event.state = "ACTIVE"
                event.last_seen = timestamp
                event.transition_samples = 0
                event.transition_since = None
            else:
                if event.transition_samples == 0:
                    event.transition_since = timestamp
                event.transition_samples += 1
                event.state = "CHANGING"

                if event.transition_samples >= self.config.transition_confirm_samples:
                    boundary = event.transition_since if event.transition_since is not None else timestamp
                    self._close_event(event, boundary)
                    event.finished = True
                    event.state = "ENDING"
                    self._create_event(boundary, event.box, source_image)
                    return

                # Do not contaminate the old event's best frame/fusion with the
                # first frame of a possible replacement.
                return

        event.fusion.update(current_mask, crop)
        event.last_mask = current_mask
        crop_sharpness = sharpness(crop)
        if crop_sharpness > event.best_sharpness:
            event.best_sharpness = crop_sharpness
            event.best_crop = crop.copy()
        self._record_ocr_candidate(event, timestamp, crop)

    def _expire_missing_events(self, timestamp: float) -> None:
        for event in self.events:
            if event.finished or event.missing_since is None:
                continue
            if (timestamp - event.missing_since) * 1000 >= self.config.missing_grace_ms:
                self._close_event(event, event.missing_since)
                event.finished = True
                event.state = "ENDING"

    def _close_event(self, event: TextEvent, timestamp: float) -> None:
        if event.finished:
            return

        if (timestamp - event.candidate_start) * 1000 < self.config.min_event_duration_ms:
            return

        if self.config.detector_only:
            # The source is sampled at detector FPS in this mode. Place the
            # visible edge halfway between samples instead of snapping timing
            # to the first or last detector frame.
            sample_interval = 1.0 / self.config.effective_normal_fps
            start_time = max(0.0, event.candidate_start - sample_interval / 2.0)
            if timestamp > event.last_seen + 1e-6:
                end_time = event.last_seen + min(
                    sample_interval / 2.0,
                    (timestamp - event.last_seen) / 2.0,
                )
            else:
                end_time = timestamp
            event.active_cue = self.collector.begin(
                event,
                "",
                event.box.score,
                end_time,
                start_time,
            )
            self.stable_events += 1
            return

        if event.ocr_attempts >= self.config.max_ocr_attempts:
            return

        candidates = select_temporal_candidates(
            event.ocr_candidates,
            self.config.max_ocr_attempts,
        )
        if not candidates and event.best_crop is not None:
            candidates = [(event.last_seen, event.best_sharpness, event.best_crop)]

        readings: list[tuple[str, float]] = []
        for _candidate_time, _candidate_sharpness, image in candidates:
            if event.ocr_attempts >= self.config.max_ocr_attempts:
                break
            event.ocr_attempts += 1
            self.ocr_calls += 1
            lines, confidence = self.recognize(preprocess_crop_for_ocr(image))
            text = clean_text(lines)
            if text and confidence >= self.config.min_ocr_confidence:
                readings.append((text, confidence))

        text, confidence = select_consensus_reading(readings)
        if text:
            event.active_cue = self.collector.begin(event, text, confidence, timestamp)
            self.stable_events += 1

    def finish(self, timestamp: float) -> None:
        for event in self.events:
            if not event.finished:
                end = event.missing_since if event.missing_since is not None else timestamp
                self._close_event(event, end)
                event.finished = True


def preprocess_crop_for_ocr(crop: np.ndarray, min_height: int = 90) -> np.ndarray:
    """Upscale small subtitle crops and pad them before recognition."""
    if crop is None or crop.size == 0:
        return crop

    height, width = crop.shape[:2]
    if height < min_height:
        scale = min_height / float(height)
        crop = cv2.resize(
            crop,
            (max(32, int(width * scale)), int(height * scale)),
            interpolation=cv2.INTER_CUBIC,
        )

    border_value = (255, 255, 255) if crop.ndim == 3 else 255
    return cv2.copyMakeBorder(
        crop,
        16,
        16,
        16,
        16,
        cv2.BORDER_CONSTANT,
        value=border_value,
    )


# ============================================================================
# CUE DEDUPLICATION & SRT FORMATTER
# ============================================================================

def deduplicate_cues(cues: list[Cue]) -> list[Cue]:
    def quality(cue: Cue) -> float:
        duration = max(0.0, cue.endTime - cue.startTime)
        return cue.confidence + min(2.0, duration) * 0.05

    def bounds_iou(left: dict[str, float] | None, right: dict[str, float] | None) -> float:
        if not left or not right:
            return 0.0
        x1 = max(left["x"], right["x"])
        y1 = max(left["y"], right["y"])
        x2 = min(left["x"] + left["width"], right["x"] + right["width"])
        y2 = min(left["y"] + left["height"], right["y"] + right["height"])
        intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        if intersection <= 0:
            return 0.0
        union = left["width"] * left["height"] + right["width"] * right["height"] - intersection
        return intersection / union if union else 0.0

    result: list[Cue] = []
    for cue in sorted(cues, key=lambda item: (item.startTime, item.endTime, item.roiId or "")):
        # Fast detector-only scans intentionally have no recognized text. Keep
        # them as visual events and merge only close events in the same ROI.
        if not cue.text:
            duplicate = next(
                (
                    existing
                    for existing in result
                    if not existing.text
                    and existing.roiId == cue.roiId
                    and bounds_iou(existing.bounds, cue.bounds) >= 0.25
                    # Detector-only scans have no text to distinguish adjacent
                    # lines in the same position. Merge only overlapping boxes.
                    and min(existing.endTime, cue.endTime)
                    - max(existing.startTime, cue.startTime) > 0.04
                ),
                None,
            )
            if duplicate:
                duplicate.startTime = min(duplicate.startTime, cue.startTime)
                duplicate.endTime = max(duplicate.endTime, cue.endTime)
                duplicate.confidence = max(duplicate.confidence, cue.confidence)
                if duplicate.bounds and cue.bounds:
                    left = min(duplicate.bounds["x"], cue.bounds["x"])
                    top = min(duplicate.bounds["y"], cue.bounds["y"])
                    right = max(duplicate.bounds["x"] + duplicate.bounds["width"], cue.bounds["x"] + cue.bounds["width"])
                    bottom = max(duplicate.bounds["y"] + duplicate.bounds["height"], cue.bounds["y"] + cue.bounds["height"])
                    duplicate.bounds = {"x": left, "y": top, "width": right - left, "height": bottom - top}
                continue
            result.append(cue)
            continue
        duplicate = next(
            (
                existing
                for existing in result
                if (
                    (
                        text_similarity(existing.text, cue.text) >= 0.95
                        and cue.startTime - existing.endTime <= 0.5
                        and existing.startTime - cue.endTime <= 0.5
                    )
                    or (
                        text_similarity(existing.text, cue.text) >= 0.65
                        and min(existing.endTime, cue.endTime)
                        - max(existing.startTime, cue.startTime) > 0
                    )
                    or (
                        text_similarity(existing.text, cue.text) >= 0.55
                        and min(
                            existing.endTime - existing.startTime,
                            cue.endTime - cue.startTime,
                        ) <= 0.5
                        and abs(cue.startTime - existing.endTime) <= 0.20
                    )
                )
            ),
            None,
        )
        if duplicate:
            duplicate_duration = duplicate.endTime - duplicate.startTime
            cue_duration = cue.endTime - cue.startTime
            similar_variant = text_similarity(duplicate.text, cue.text) >= 0.65
            duplicate_is_more_stable = (
                similar_variant
                and duplicate_duration >= cue_duration * 1.75
            )
            if quality(cue) > quality(duplicate) and not duplicate_is_more_stable:
                duplicate.text = cue.text
            duplicate.startTime = min(duplicate.startTime, cue.startTime)
            duplicate.endTime = max(duplicate.endTime, cue.endTime)
            duplicate.confidence = max(duplicate.confidence, cue.confidence)
            continue
        result.append(cue)
    return [
        cue
        for cue in result
        if not (
            (not cue.text and cue.endTime - cue.startTime < 0.12)
            or (
                cue.endTime - cue.startTime <= 1.0
                and cue.confidence < 0.70
            )
            or (
                cue.text
                and
                cue.endTime - cue.startTime <= 0.5
                and len("".join(char for char in cue.text if char.isalnum())) <= 1
            )
        )
    ]


def format_srt(cues: list[Cue]) -> str:
    def timestamp(seconds: float) -> str:
        milliseconds = max(0, round(seconds * 1000))
        hours, remainder = divmod(milliseconds, 3_600_000)
        minutes, remainder = divmod(remainder, 60_000)
        seconds_val, milliseconds = divmod(remainder, 1000)
        return f"{hours:02d}:{minutes:02d}:{seconds_val:02d},{milliseconds:03d}"

    return "\n\n".join(
        f"{index}\n{timestamp(cue.startTime)} --> {timestamp(cue.endTime)}\n{cue.text}"
        for index, cue in enumerate(cues, start=1)
    )


# ============================================================================
# MAIN PIPELINE PROCESSOR
# ============================================================================

def process_video(
    video_path: str,
    rois: list[ROI],
    recognize: Recognizer,
    config: OCRConfig | None = None,
    detector: Detector | None = None,
) -> tuple[list[Cue], dict[str, Any]]:
    """Decodes a video once and produces timestamped OCR cues using 2-tier Fast Scanner + Heavy OCR."""

    t0 = time.time()
    cpu_t0 = time.process_time()
    config = config or OCRConfig()
    active_rois = [roi for roi in rois if roi.enabled]
    if not active_rois:
        active_rois = [ROI(id="full-frame", x=0, y=0, width=1, height=1)]

    detector = detector or OpenCVTextDetector().detect

    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open video file: {video_path}")

    native_fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    history_capacity = max(2, ceil(native_fps * config.boundary_history_ms / 1000))

    # Stage 1: Prescan for auto-threshold & static watermark detection
    prescanner = TextPrescanner(config)
    prescan_info = prescanner.prescan(
        capture,
        active_rois,
        # Keep static watermark rejection in fast mode, but avoid a large
        # fixed prescan cost before the detector-only pass.
        sample_count=18 if config.detector_only else 30,
    )

    collector = CueCollector()
    trackers = [
        ROITracker(
            roi=roi,
            config=config,
            detector=detector,
            recognize=recognize,
            collector=collector,
            threshold=prescan_info.get(roi.id, {}).get("threshold", config.fallback_threshold),
            static_mask=prescan_info.get(roi.id, {}).get("static_mask"),
            history_capacity=history_capacity,
        )
        for roi in active_rois
    ]

    t_scan_start = time.time()
    frame_index = 0
    # Detector-only scanning does not need per-frame mask/OCR work. `grab()`
    # advances the decoder without copying BGR pixels into Python; sampled
    # frames still go through the same temporal tracker.
    frame_stride = (
        max(1, round(native_fps / config.effective_normal_fps))
        if config.detector_only
        else 1
    )

    try:
        while True:
            if config.detector_only and frame_index % frame_stride != 0:
                if not capture.grab():
                    break
                frame_index += 1
                continue
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            timestamp = frame_index / native_fps
            frame_index += 1

            for tracker in trackers:
                roi_img = crop_roi(frame, tracker.roi)
                if roi_img.size > 0:
                    tracker.observe(timestamp, roi_img)
    finally:
        capture.release()

    t_scan_end = time.time()
    duration = frame_index / native_fps

    for tracker in trackers:
        tracker.finish(duration)

    cues = deduplicate_cues(collector.cues)
    t_end = time.time()

    detector_calls = sum(t.detector_calls for t in trackers)
    ocr_calls = sum(t.ocr_calls for t in trackers)
    events_detected = sum(t.stable_events for t in trackers)

    metrics = {
        "nativeFps": native_fps,
        "decodedFrames": frame_index,
        "sampledFrames": detector_calls,
        "samplingRatio": round(detector_calls / max(1, frame_index), 3),
        "eventsDetected": events_detected,
        "eventsMerged": max(0, events_detected - len(cues)),
        "ocrCalls": ocr_calls,
        "ocrCallsPerCue": round(ocr_calls / max(1, len(cues)), 3) if cues else 0.0,
        "duration": duration,
        "scanTimeMs": round((t_scan_end - t_scan_start) * 1000, 1),
        "totalTimeMs": round((t_end - t0) * 1000, 1),
        "processCpuTimeMs": round((time.process_time() - cpu_t0) * 1000, 1),
    }
    return cues, metrics
