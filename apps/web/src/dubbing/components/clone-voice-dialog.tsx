"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Mic2, Play, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils/ui";
import {
	GEMINI_TTS_LANGUAGES,
	GEMINI_TTS_MODELS,
	GEMINI_TTS_VOICES,
} from "../gemini-tts-options";
import { createVoice, previewCloneVoice, stopVoicePreview } from "../services/tts";

type CloneProvider = "vieneu" | "elevenlabs" | "gemini" | "omnivoice";
type VieNeuEngine = "v2" | "v3";

const PREVIEW_TEXT = "Xin chào, đây là giọng đọc thử cho phần thuyết minh.";

function AdjustmentSliders({
	rate,
	pitch,
	volumeGain,
	disabled,
	onRateChange,
	onPitchChange,
	onVolumeChange,
}: {
	rate: number;
	pitch: number;
	volumeGain: number;
	disabled: boolean;
	onRateChange: (value: number) => void;
	onPitchChange: (value: number) => void;
	onVolumeChange: (value: number) => void;
}) {
	return (
		<div className="space-y-3 rounded-lg border bg-muted/20 p-3">
			<p className="text-[10px] font-semibold uppercase text-muted-foreground">
				Tinh chỉnh trước khi lưu
			</p>
			<p className="text-[10px] text-muted-foreground">
				Giọng clone thường đọc chậm. Tăng tốc độ, nghe thử, rồi mới lưu vào kho.
			</p>
			<div className="grid gap-3 sm:grid-cols-3">
				<div>
					<div className="mb-1 flex justify-between text-[10px]">
						<span>Tốc độ</span>
						<span>{rate.toFixed(2)}×</span>
					</div>
					<Slider
						min={0.5}
						max={2}
						step={0.05}
						value={[rate]}
						disabled={disabled}
						onValueChange={([value]) => onRateChange(value)}
					/>
				</div>
				<div>
					<div className="mb-1 flex justify-between text-[10px]">
						<span>Cao độ</span>
						<span>
							{pitch > 0 ? "+" : ""}
							{pitch} st
						</span>
					</div>
					<Slider
						min={-12}
						max={12}
						step={1}
						value={[pitch]}
						disabled={disabled}
						onValueChange={([value]) => onPitchChange(value)}
					/>
				</div>
				<div>
					<div className="mb-1 flex justify-between text-[10px]">
						<span>Âm lượng</span>
						<span>
							{volumeGain > 0 ? "+" : ""}
							{volumeGain} dB
						</span>
					</div>
					<Slider
						min={-12}
						max={12}
						step={1}
						value={[volumeGain]}
						disabled={disabled}
						onValueChange={([value]) => onVolumeChange(value)}
					/>
				</div>
			</div>
		</div>
	);
}

export function CloneVoiceDialog({
	open,
	onOpenChange,
	onCreated,
	elevenlabsConfigured,
	geminiConfigured,
	omnivoiceConfigured,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => Promise<void> | void;
	elevenlabsConfigured: boolean;
	geminiConfigured: boolean;
	omnivoiceConfigured: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [dragging, setDragging] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [previewing, setPreviewing] = useState(false);
	const [provider, setProvider] = useState<CloneProvider>("vieneu");
	const [vieneuEngine, setVieNeuEngine] = useState<VieNeuEngine>("v2");
	const [hasConsent, setHasConsent] = useState(false);
	const [geminiModel, setGeminiModel] = useState<
		(typeof GEMINI_TTS_MODELS)[number]
	>(GEMINI_TTS_MODELS[0]);
	const [geminiLanguage, setGeminiLanguage] = useState("vi-VN");
	const [geminiVoice, setGeminiVoice] = useState<
		(typeof GEMINI_TTS_VOICES)[number]
	>("Kore");
	const [styleInstructions, setStyleInstructions] = useState("");
	const [rate, setRate] = useState(1.2);
	const [pitch, setPitch] = useState(0);
	const [volumeGain, setVolumeGain] = useState(0);

	const busy = submitting || previewing;
	const canPreview = provider === "gemini" || file !== null;

	const chooseFile = (next: File | null) => {
		if (next && !/\.(wav|mp3)$/i.test(next.name)) {
			toast.error("Chỉ hỗ trợ file WAV hoặc MP3.");
			return;
		}
		setFile(next);
	};

	const resetForm = () => {
		setName("");
		setFile(null);
		setHasConsent(false);
		setStyleInstructions("");
		setRate(1.2);
		setPitch(0);
		setVolumeGain(0);
	};

	const preview = async () => {
		if (provider !== "gemini" && !file) {
			return toast.error("Vui lòng chọn file giọng mẫu trước khi nghe thử.");
		}
		setPreviewing(true);
		try {
			if (provider === "gemini") {
				await previewCloneVoice({
					provider: "gemini",
					voice: geminiVoice,
					model: geminiModel,
					language: geminiLanguage,
					styleInstructions,
					rate,
					pitch,
					volumeGain,
					text: PREVIEW_TEXT,
				});
			} else {
				await previewCloneVoice({
					provider,
					audio: file as File,
					engine: provider === "vieneu" ? vieneuEngine : undefined,
					rate,
					pitch,
					volumeGain,
					text: PREVIEW_TEXT,
				});
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Không thể nghe thử giọng clone",
			);
		} finally {
			setPreviewing(false);
		}
	};

	const submit = async () => {
		if (provider === "gemini") {
			if (!name.trim()) return toast.error("Vui lòng nhập tên preset Gemini.");
			setSubmitting(true);
			try {
				const response = await fetch("/api/tts/gemini-presets", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: name.trim(),
						model: geminiModel,
						language: geminiLanguage,
						voice: geminiVoice,
						styleInstructions,
						rate,
						pitch,
						volumeGain,
					}),
				});
				if (!response.ok) {
					const payload: unknown = await response.json().catch(() => null);
					throw new Error(
						typeof payload === "object" &&
							payload !== null &&
							"error" in payload &&
							typeof payload.error === "string"
							? payload.error
							: "Không thể lưu preset Gemini TTS.",
					);
				}
				await onCreated();
				toast.success(`Đã lưu preset Gemini ${name.trim()}`);
				resetForm();
				onOpenChange(false);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Không thể lưu preset Gemini TTS.",
				);
			} finally {
				setSubmitting(false);
			}
			return;
		}
		if (!name.trim()) return toast.error("Vui lòng nhập tên mẫu giọng.");
		if (!file) return toast.error("Vui lòng chọn file giọng mẫu.");
		if (!hasConsent) {
			return toast.error("Bạn cần xác nhận quyền sử dụng giọng mẫu.");
		}
		setSubmitting(true);
		try {
			await createVoice({
				name: name.trim(),
				audio: file,
				provider,
				engine: provider === "vieneu" ? vieneuEngine : undefined,
				consent: hasConsent,
				rate,
				pitch,
				volumeGain,
			});
			await onCreated();
			toast.success(`Đã tạo giọng clone ${name.trim()} · ${rate.toFixed(2)}×`);
			resetForm();
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Không thể tạo giọng clone",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (busy) return;
				if (!nextOpen) stopVoicePreview();
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="max-w-2xl overflow-hidden">
				<DialogHeader className="flex-row items-start gap-3 space-y-0">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-500">
						<Mic2 className="size-5" />
					</div>
					<div className="space-y-1">
						<DialogTitle>Thêm giọng clone</DialogTitle>
						<DialogDescription>
							Tạo một giọng riêng từ file thu âm rõ tiếng. Nghe thử và chỉnh tốc
							độ trước khi lưu vào kho.
						</DialogDescription>
					</div>
				</DialogHeader>
				<DialogBody className="gap-5">
					<div>
						<p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
							Công nghệ giọng
						</p>
						<div className="grid grid-cols-2 gap-2">
							{(
								[
									{
										id: "vieneu",
										title: "VieNeu",
										note: "Chọn v2 hoặc v3 trước khi clone",
										enabled: true,
									},
									{
										id: "omnivoice",
										title: "OmniVoice",
										note: omnivoiceConfigured
											? "Clone chuẩn · GPU · 3–10 giây"
											: "Bật trong Cấu hình TTS",
										enabled: omnivoiceConfigured,
									},
									{
										id: "elevenlabs",
										title: "ElevenLabs",
										note: elevenlabsConfigured
											? "Instant Voice Clone"
											: "Cần API key",
										enabled: elevenlabsConfigured,
									},
									{
										id: "gemini",
										title: "Gemini TTS",
										note: geminiConfigured
											? "Tạo preset đọc: model, ngôn ngữ, style"
											: "Cần API key",
										enabled: geminiConfigured,
									},
								] as const
							).map((engine) => (
								<button
									key={engine.id}
									type="button"
									disabled={!engine.enabled || busy}
									onClick={() => setProvider(engine.id)}
									className={cn(
										"rounded-lg border p-3 text-left disabled:opacity-45",
										provider === engine.id && "border-amber-500/45 bg-amber-500/10",
									)}
								>
									<div className="flex items-center gap-2">
										<Mic2 className="size-4" />
										<span className="text-xs font-semibold">{engine.title}</span>
										{provider === engine.id && (
											<CheckCircle2 className="ml-auto size-4 text-amber-500" />
										)}
									</div>
									<p className="mt-1 text-[9px] text-muted-foreground">
										{engine.note}
									</p>
								</button>
							))}
						</div>
					</div>
					{provider === "vieneu" && (
						<div>
							<p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
								Model VieNeu
							</p>
							<div className="grid grid-cols-2 gap-2">
								{(
									[
										{
											id: "v2" as const,
											title: "VieNeu v2 Turbo",
											note: "24 kHz · clone giống mẫu hơn",
										},
										{
											id: "v3" as const,
											title: "VieNeu v3 Turbo",
											note: "48 kHz · catalog hiện tại",
										},
									] as const
								).map((engine) => (
									<button
										key={engine.id}
										type="button"
										disabled={busy}
										onClick={() => setVieNeuEngine(engine.id)}
										className={cn(
											"rounded-lg border p-3 text-left disabled:opacity-45",
											vieneuEngine === engine.id &&
												"border-amber-500/45 bg-amber-500/10",
										)}
									>
										<div className="flex items-center gap-2">
											<span className="text-xs font-semibold">{engine.title}</span>
											{vieneuEngine === engine.id && (
												<CheckCircle2 className="ml-auto size-4 text-amber-500" />
											)}
										</div>
										<p className="mt-1 text-[9px] text-muted-foreground">
											{engine.note}
										</p>
									</button>
								))}
							</div>
						</div>
					)}
					{provider === "omnivoice" && (
						<p className="rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[10px] leading-relaxed text-amber-500">
							OmniVoice nặng, cần NVIDIA GPU và file mẫu 3–10 giây. Lần đầu tải
							model sẽ lâu hơn các lần sau.
						</p>
					)}
					<label htmlFor="clone-voice-name" className="space-y-2">
						<span className="text-[10px] font-semibold uppercase text-muted-foreground">
							Tên mẫu giọng
						</span>
						<Input
							id="clone-voice-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							maxLength={80}
							placeholder="Ví dụ: Giọng của tôi..."
							disabled={busy}
						/>
					</label>
					{provider === "gemini" && (
						<div className="space-y-3 rounded-lg border bg-muted/20 p-3">
							<div className="grid gap-3 sm:grid-cols-2">
								<label className="space-y-1">
									<span className="text-[10px] font-semibold uppercase text-muted-foreground">
										Model
									</span>
									<select
										value={geminiModel}
										disabled={busy}
										onChange={(event) =>
											setGeminiModel(
												event.target.value as (typeof GEMINI_TTS_MODELS)[number],
											)
										}
										className="h-9 w-full rounded-md border bg-background px-2 text-xs"
									>
										{GEMINI_TTS_MODELS.map((model) => (
											<option key={model} value={model}>
												{model}
											</option>
										))}
									</select>
								</label>
								<label className="space-y-1">
									<span className="text-[10px] font-semibold uppercase text-muted-foreground">
										Ngôn ngữ
									</span>
									<select
										value={geminiLanguage}
										disabled={busy}
										onChange={(event) => setGeminiLanguage(event.target.value)}
										className="h-9 w-full rounded-md border bg-background px-2 text-xs"
									>
										{GEMINI_TTS_LANGUAGES.map((language) => (
											<option key={language.id} value={language.id}>
												{language.name}
											</option>
										))}
									</select>
								</label>
								<label className="space-y-1 sm:col-span-2">
									<span className="text-[10px] font-semibold uppercase text-muted-foreground">
										Giọng nền Gemini
									</span>
									<select
										value={geminiVoice}
										disabled={busy}
										onChange={(event) =>
											setGeminiVoice(
												event.target.value as (typeof GEMINI_TTS_VOICES)[number],
											)
										}
										className="h-9 w-full rounded-md border bg-background px-2 text-xs"
									>
										{GEMINI_TTS_VOICES.map((voice) => (
											<option key={voice} value={voice}>
												{voice}
											</option>
										))}
									</select>
								</label>
							</div>
							<label className="block space-y-1">
								<span className="text-[10px] font-semibold uppercase text-muted-foreground">
									Style instructions
								</span>
								<Textarea
									value={styleInstructions}
									disabled={busy}
									onChange={(event) => setStyleInstructions(event.target.value)}
									maxLength={1500}
									placeholder="Ví dụ: Giọng nữ trẻ, ấm áp, kể chuyện tự nhiên, nhấn nhẹ các từ quan trọng."
									className="min-h-20 text-xs"
								/>
							</label>
						</div>
					)}
					{provider !== "gemini" && (
						<div>
							<p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
								File ghi âm mẫu (WAV/MP3, khuyến nghị 3–8 giây)
							</p>
							<button
								type="button"
								disabled={busy}
								className={cn(
									"flex w-full items-center gap-3 rounded-lg border border-dashed p-4 text-left transition-colors hover:bg-muted/40",
									dragging && "border-amber-500 bg-amber-500/5",
								)}
								onClick={() => inputRef.current?.click()}
								onDragOver={(event) => {
									event.preventDefault();
									setDragging(true);
								}}
								onDragLeave={() => setDragging(false)}
								onDrop={(event) => {
									event.preventDefault();
									setDragging(false);
									chooseFile(event.dataTransfer.files[0] ?? null);
								}}
							>
								<div className="flex size-9 items-center justify-center rounded-md bg-muted">
									<Upload className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-medium">
										{file?.name || "Chọn hoặc kéo thả file âm thanh"}
									</p>
									<p className="mt-1 text-[10px] text-muted-foreground">
										{provider === "omnivoice"
											? "OmniVoice bắt buộc 3–10 giây, giọng rõ, không nhạc nền · tối đa 20 MB"
											: "Giọng rõ, không nhạc nền · file dài hơn 8 giây vẫn được hỗ trợ · tối đa 20 MB"}
									</p>
								</div>
								<span className="rounded-md border px-2 py-1 text-[10px]">
									Chọn file
								</span>
							</button>
							<input
								ref={inputRef}
								type="file"
								accept="audio/wav,audio/mpeg,.wav,.mp3"
								className="hidden"
								onChange={(event) =>
									chooseFile(event.target.files?.[0] ?? null)
								}
							/>
							<label className="mt-3 flex items-start gap-2 text-[10px] text-muted-foreground">
								<input
									type="checkbox"
									checked={hasConsent}
									disabled={busy}
									onChange={(event) => setHasConsent(event.target.checked)}
									className="mt-0.5"
								/>
								<span>
									Tôi xác nhận có quyền sử dụng và nhân bản giọng nói trong file
									này.
								</span>
							</label>
						</div>
					)}
					<AdjustmentSliders
						rate={rate}
						pitch={pitch}
						volumeGain={volumeGain}
						disabled={busy}
						onRateChange={setRate}
						onPitchChange={setPitch}
						onVolumeChange={setVolumeGain}
					/>
				</DialogBody>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={busy}
					>
						Hủy
					</Button>
					<Button
						variant="outline"
						onClick={preview}
						disabled={busy || !canPreview}
					>
						{previewing ? (
							<Spinner className="size-4" />
						) : (
							<Play className="size-4" />
						)}
						{previewing ? "Đang nghe thử..." : "Nghe thử"}
					</Button>
					<Button
						className="bg-amber-500 text-black hover:bg-amber-400"
						onClick={submit}
						disabled={busy}
					>
						{submitting ? <Spinner className="size-4" /> : <Plus className="size-4" />}
						{submitting ? "Đang tạo giọng..." : "Tạo và lưu vào kho"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
