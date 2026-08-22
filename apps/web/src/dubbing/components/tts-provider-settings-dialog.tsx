"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
	fetchGpuRuntimeStatus,
	formatBytes,
	startGpuRuntimeInstall,
	type GpuRuntimeStatus,
} from "../services/gpu-runtime";
import { fetchTtsEngineStatuses, runTtsEngineAction, type TtsEngineStatus } from "../services/tts-runtime";
import { fetchTtsProviderStatus, saveOmniVoiceSettings, saveTtsProviderKey, type TtsProviderStatus } from "../services/tts";

type Provider = "gemini" | "elevenlabs";
const EMPTY_STATUS: TtsProviderStatus = {
	gemini: { configured: false, source: null },
	elevenlabs: { configured: false, source: null },
	omnivoice: { enabled: false, gpuAvailable: false, installed: false, effectiveDevice: "cpu" },
};

export function TtsProviderSettingsDialog({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => Promise<void> | void }) {
	const [status, setStatus] = useState(EMPTY_STATUS);
	const [keys, setKeys] = useState<Record<Provider, string>>({ gemini: "", elevenlabs: "" });
	const [visible, setVisible] = useState<Record<Provider, boolean>>({ gemini: false, elevenlabs: false });
	const [busy, setBusy] = useState<Provider | null>(null);
	const [omnivoiceBusy, setOmnivoiceBusy] = useState(false);
	const [gpu, setGpu] = useState<GpuRuntimeStatus | null>(null);
	const [gpuBusy, setGpuBusy] = useState(false);
	const [engines, setEngines] = useState<TtsEngineStatus[]>([]);
	const [engineBusy, setEngineBusy] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		fetchTtsProviderStatus().then(setStatus).catch((error) => toast.error(error instanceof Error ? error.message : "Không thể đọc cấu hình TTS"));
		fetchTtsEngineStatuses().then(setEngines).catch((error) => toast.error(error instanceof Error ? error.message : "Không thể đọc gói giọng"));
	}, [open]);

	useEffect(() => {
		if (!open) return;
		let timer = 0;
		let cancelled = false;
		const tick = async () => {
			try {
				const next = await fetchGpuRuntimeStatus();
				const nextEngines = await fetchTtsEngineStatuses();
				if (cancelled) return;
				setGpu(next);
				setEngines(nextEngines);
				const active =
					next.job?.state === "downloading" ||
					next.job?.state === "verifying" ||
					next.job?.state === "extracting";
				const engineActive = nextEngines.some((item) => item.job && ["downloading", "verifying", "extracting"].includes(item.job.state));
				if (active || engineActive) timer = window.setTimeout(tick, 1000);
			} catch (error) {
				if (!cancelled) {
					toast.error(error instanceof Error ? error.message : "Không đọc được trạng thái GPU");
				}
			}
		};
		void tick();
		return () => {
			cancelled = true;
			if (timer) window.clearTimeout(timer);
		};
	}, [open, gpu?.job?.state]);

	const save = async (provider: Provider) => {
		const value = keys[provider].trim();
		if (value.length < 10) return toast.error("API key quá ngắn hoặc đang để trống.");
		setBusy(provider);
		try {
			setStatus(await saveTtsProviderKey({ provider, value }));
			setKeys((current) => ({ ...current, [provider]: "" }));
			await onChanged();
			toast.success(`Đã lưu API key ${provider === "gemini" ? "Gemini" : "ElevenLabs"}`);
		} catch (error) { toast.error(error instanceof Error ? error.message : "Không thể lưu API key"); }
		finally { setBusy(null); }
	};

	const remove = async (provider: Provider) => {
		setBusy(provider);
		try {
			setStatus(await saveTtsProviderKey({ provider, value: null }));
			await onChanged();
			toast.success("Đã xóa API key lưu trên máy");
		} catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xóa API key"); }
		finally { setBusy(null); }
	};

	const installGpu = async () => {
		setGpuBusy(true);
		try {
			setGpu(await startGpuRuntimeInstall());
			toast.success("Đang tải gói GPU từ GitHub.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Không thể tải gói GPU");
		} finally {
			setGpuBusy(false);
		}
	};

	const updateOmniVoice = async (enabled: boolean) => {
		setOmnivoiceBusy(true);
		try {
			setStatus(await saveOmniVoiceSettings({ enabled }));
			await onChanged();
			toast.success(enabled ? "Đã bật OmniVoice" : "Đã tắt OmniVoice");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Không thể cập nhật OmniVoice");
		} finally {
			setOmnivoiceBusy(false);
		}
	};
	const engineAction = async (engine: TtsEngineStatus["engine"], action: "install" | "remove" | "reinstall") => {
		setEngineBusy(`${engine}:${action}`);
		try { setEngines(await runTtsEngineAction(engine, action)); toast.success(action === "remove" ? `Đã xóa ${engine}` : `Đang xử lý gói ${engine}`); }
		catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xử lý gói giọng"); }
		finally { setEngineBusy(null); }
	};

	return <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
		<DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
			<DialogHeader className="flex-row items-start gap-3 space-y-0">
				<div className="flex size-10 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-500"><KeyRound className="size-5" /></div>
				<div className="space-y-1"><DialogTitle>Cấu hình dịch vụ TTS</DialogTitle><DialogDescription>Key chỉ được lưu phía server trên máy này và không hiển thị lại sau khi lưu.</DialogDescription></div>
			</DialogHeader>
			<DialogBody className="min-h-0 overflow-y-auto">
				<div className="rounded-lg border p-4">
					<p className="text-xs font-semibold">Gói GPU (CUDA)</p>
					<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
						App mặc định chạy CPU cho nhẹ. Máy có NVIDIA ≥ 4 GB có thể tải gói CUDA từ GitHub Releases rồi cài local — không nhét vào installer.
					</p>
					<p className="mt-3 rounded-md bg-muted/50 px-2.5 py-2 text-[10px] text-muted-foreground">
						{!gpu
							? "Đang kiểm tra GPU…"
							: gpu.ready
								? gpu.localCuda
									? `GPU sẵn sàng trên máy này${gpu.gpuName ? ` · ${gpu.gpuName}` : ""}.`
									: `Đã cài gói CUDA ${gpu.installedVersion ?? ""}.`
								: !gpu.gpuAvailable
									? "Không có NVIDIA GPU ≥ 4 GB — giữ CPU, không cần tải CUDA."
									: !gpu.sourceConfigured
										? "Chưa xác định được nguồn tải gói CUDA."
										: !gpu.manifest
											? "Chưa đọc được manifest gói CUDA trên GitHub. Kiểm tra kết nối mạng rồi thử lại."
											: `Có GPU${gpu.gpuName ? ` · ${gpu.gpuName}` : ""}. Gói ${gpu.manifest.version} · ${formatBytes(gpu.manifest.size)}${gpu.manifest.partCount > 1 ? ` · ${gpu.manifest.partCount} phần` : ""}.`}
					</p>
					{gpu?.job && gpu.job.state !== "idle" && (
						<div className="mt-3 space-y-1.5">
							<Progress
								value={
									gpu.job.total > 0
										? Math.min(100, Math.round((gpu.job.received / gpu.job.total) * 100))
										: 0
								}
							/>
							<p className="text-[10px] text-muted-foreground">
								{gpu.job.state === "downloading" && `Đang tải ${formatBytes(gpu.job.received)} / ${formatBytes(gpu.job.total)}`}
								{gpu.job.state === "verifying" && "Đang kiểm tra checksum…"}
								{gpu.job.state === "extracting" && "Đang giải nén vào máy…"}
								{gpu.job.state === "done" && "Đã cài xong gói GPU."}
								{gpu.job.state === "error" && (gpu.job.error || "Tải gói GPU thất bại.")}
							</p>
						</div>
					)}
					{gpu && !gpu.ready && gpu.gpuAvailable && gpu.sourceConfigured && gpu.manifest && (
						<Button
							className="mt-3"
							size="sm"
							onClick={installGpu}
							disabled={gpuBusy || gpu.job?.state === "downloading" || gpu.job?.state === "verifying" || gpu.job?.state === "extracting"}
						>
							{gpuBusy || gpu.job?.state === "downloading" ? <Spinner /> : `Tải gói GPU (${formatBytes(gpu.manifest.size)})`}
						</Button>
					)}
				</div>
				<div className="rounded-lg border p-4">
					<p className="text-xs font-semibold">Gói engine giọng (cài độc lập)</p>
					<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">VieNeu, Supertonic và OmniVoice được tải riêng; có thể cài lại hoặc xóa từng gói để giải phóng dung lượng.</p>
					<div className="mt-3 space-y-2">
						{engines.map((item) => {
							const active = item.job && ["downloading", "verifying", "extracting"].includes(item.job.state);
							return <div key={item.engine} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2"><div className="min-w-0 flex-1"><p className="text-[11px] font-medium">{item.engine === "vieneu" ? "VieNeu" : item.engine === "supertonic" ? "Supertonic" : "OmniVoice"}</p><p className="text-[10px] text-muted-foreground">{active ? `${item.job?.state === "downloading" ? `Đang tải ${formatBytes(item.job.received)} / ${formatBytes(item.job.total)}` : item.job?.state === "extracting" ? "Đang giải nén…" : "Đang kiểm tra…"}` : item.installed ? `Đã cài ${item.installedVersion ?? ""}` : item.manifest ? `${formatBytes(item.manifest.size)} · sẵn sàng cài` : "Chưa đọc được manifest"}</p></div>{item.installed && !active && <Button variant="ghost" size="sm" onClick={() => engineAction(item.engine, "remove")} disabled={Boolean(engineBusy)}><Trash2 className="size-3.5" /></Button>}<Button size="sm" variant={item.installed ? "outline" : "default"} onClick={() => engineAction(item.engine, item.installed ? "reinstall" : "install")} disabled={Boolean(engineBusy) || Boolean(active) || !item.manifest}>{engineBusy?.startsWith(item.engine) || active ? <Spinner /> : item.installed ? "Cài lại" : "Cài"}</Button></div>;
						})}
					</div>
				</div>
				<div className="rounded-lg border border-sky-500/25 p-4">
					<div className="flex items-start gap-3">
						<div className="min-w-0 flex-1">
							<p className="text-xs font-semibold">OmniVoice · clone chuẩn</p>
							<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
								Zero-shot clone giống mẫu. Nặng, chỉ chạy trên NVIDIA GPU ≥ 4 GB. File mẫu 3–10 giây.
							</p>
						</div>
						{omnivoiceBusy && <Spinner className="size-4" />}
					</div>
					<div className="mt-4">
						<div className="flex items-center justify-between gap-3 text-xs">
							<span>
								<span className="font-medium">Bật OmniVoice</span>
								<span className="mt-0.5 block text-[10px] text-muted-foreground">
									{!status.omnivoice.installed
										? "Chưa cài .local-services/omnivoice"
										: !status.omnivoice.gpuAvailable
											? "Cần NVIDIA GPU ≥ 4 GB"
											: "Hiển thị tab OmniVoice và cho phép clone"}
								</span>
							</span>
							<Switch
								aria-label="Bật OmniVoice"
								checked={status.omnivoice.enabled}
								disabled={omnivoiceBusy || !status.omnivoice.installed || !status.omnivoice.gpuAvailable}
								onCheckedChange={updateOmniVoice}
							/>
						</div>
					</div>
					<p className="mt-3 rounded-md bg-muted/50 px-2.5 py-2 text-[10px] text-muted-foreground">
						Trạng thái: {!status.omnivoice.installed ? "chưa cài" : !status.omnivoice.gpuAvailable ? "thiếu GPU" : status.omnivoice.enabled ? "đã bật · GPU" : "đã tắt"}.
					</p>
				</div>
				{(["gemini", "elevenlabs"] as const).map((provider) => {
					const label = provider === "gemini" ? "Gemini TTS" : "ElevenLabs";
					const configured = status[provider].configured;
					const environment = status[provider].source === "environment";
					return <div key={provider} className="rounded-lg border p-4">
						<div className="mb-3 flex items-center"><div><p className="text-xs font-semibold">{label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{configured ? `Đã cấu hình${environment ? " bằng biến môi trường" : " trên máy"}` : "Chưa cấu hình"}</p></div>{configured && <CheckCircle2 className="ml-auto size-4 text-emerald-500" />}</div>
						<div className="flex gap-2">
							<div className="relative min-w-0 flex-1"><Input aria-label={`API key ${label}`} type={visible[provider] ? "text" : "password"} value={keys[provider]} onChange={(event) => setKeys((current) => ({ ...current, [provider]: event.target.value }))} placeholder={configured ? "Nhập key mới để thay thế" : "Nhập API key..."} className="pr-9" autoComplete="off" /><Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7" aria-label={visible[provider] ? "Ẩn API key" : "Hiện API key"} onClick={() => setVisible((current) => ({ ...current, [provider]: !current[provider] }))}>{visible[provider] ? <EyeOff /> : <Eye />}</Button></div>
							<Button onClick={() => save(provider)} disabled={busy !== null}>{busy === provider ? <Spinner /> : "Lưu"}</Button>
							{configured && !environment && <Button variant="outline" size="icon" aria-label={`Xóa API key ${label}`} onClick={() => remove(provider)} disabled={busy !== null}><Trash2 /></Button>}
						</div>
					</div>;
				})}
				<div className="rounded-md bg-muted/50 p-3 text-[10px] leading-relaxed text-muted-foreground">Gemini API key lấy tại Google AI Studio. ElevenLabs API key lấy trong mục Developers → API Keys của tài khoản ElevenLabs.</div>
			</DialogBody>
			<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy !== null}>Đóng</Button></DialogFooter>
		</DialogContent>
	</Dialog>;
}
