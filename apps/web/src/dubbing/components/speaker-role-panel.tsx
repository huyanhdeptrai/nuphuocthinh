"use client";

import { useDubbingStore } from "../dubbing-store";
import type { SpeakerGender, SpeakerProfile } from "../types";
import {
	ADDRESS_PRONOUN_OPTIONS,
	SELF_PRONOUN_OPTIONS,
	collectSpeakerProfiles,
	defaultPronounsForGender,
} from "../services/speaker-roles";

const GENDER_OPTIONS: Array<{ value: SpeakerGender; label: string }> = [
	{ value: "female", label: "Nữ" },
	{ value: "male", label: "Nam" },
	{ value: "unknown", label: "?" },
];

export function SpeakerRolePanel() {
	const extractedCues = useDubbingStore((state) => state.extractedCues);
	const speakerProfiles = useDubbingStore((state) => state.speakerProfiles);
	const updateSpeakerProfile = useDubbingStore(
		(state) => state.updateSpeakerProfile,
	);
	const speakers = collectSpeakerProfiles({
		cues: extractedCues,
		profiles: speakerProfiles,
	});

	if (speakers.length === 0) return null;

	const applyGender = ({
		speaker,
		gender,
	}: {
		speaker: SpeakerProfile;
		gender: SpeakerGender;
	}) => {
		const defaults = defaultPronounsForGender(gender);
		updateSpeakerProfile(speaker.id, {
			gender,
			selfPronoun: speaker.selfPronoun || defaults.selfPronoun,
			addressPronoun: speaker.addressPronoun || defaults.addressPronoun,
		});
	};

	return (
		<div className="space-y-1.5 rounded-lg border bg-card p-2 text-xs">
			<div>
				<p className="font-semibold">Phân vai / xưng hô</p>
				<p className="text-[9px] text-muted-foreground">
					Gán Nam/Nữ và cặp xưng–gọi. Khi dịch, AI bắt buộc bám đúng vai này.
				</p>
			</div>
			<div className="space-y-1.5">
				{speakers.map((speaker) => (
					<div
						key={speaker.id}
						className="space-y-1 rounded-md border bg-background p-1.5"
					>
						<div className="flex items-center justify-between gap-2">
							<span
								className="truncate text-[11px] font-semibold"
								style={{ color: speaker.color }}
							>
								{speaker.name}
							</span>
							<div className="flex shrink-0 gap-0.5">
								{GENDER_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() =>
											applyGender({ speaker, gender: option.value })
										}
										className={`h-5 rounded border px-1.5 text-[9px] ${
											(speaker.gender ?? "unknown") === option.value
												? "border-violet-500 bg-violet-500/10 font-semibold text-violet-500"
												: "text-muted-foreground"
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
						</div>
						<div className="grid grid-cols-2 gap-1.5">
							<label className="space-y-0.5">
								<span className="text-[8px] uppercase tracking-wide text-muted-foreground">
									Xưng (tự xưng)
								</span>
								<input
									list={`self-pronouns-${speaker.id}`}
									value={speaker.selfPronoun ?? ""}
									onChange={(event) => {
										const value = event.target.value;
										updateSpeakerProfile(speaker.id, {
											// Keep an in-progress space so multi-word pronouns can
											// be typed naturally (for example "người con").
											selfPronoun: value.trim() ? value : undefined,
										});
									}}
									placeholder="Tự suy (vd: tôi, ní...)"
									className="h-6 w-full rounded-md border bg-background px-1.5 text-[10px] placeholder:text-[9px] placeholder:text-muted-foreground/60 focus:border-violet-500 focus:outline-hidden"
									aria-label={`Xưng hô của ${speaker.name}`}
								/>
								<datalist id={`self-pronouns-${speaker.id}`}>
									{SELF_PRONOUN_OPTIONS.map((pronoun) => (
										<option key={pronoun} value={pronoun} />
									))}
								</datalist>
							</label>
							<label className="space-y-0.5">
								<span className="text-[8px] uppercase tracking-wide text-muted-foreground">
									Gọi (đối phương)
								</span>
								<input
									list={`address-pronouns-${speaker.id}`}
									value={speaker.addressPronoun ?? ""}
									onChange={(event) => {
										const value = event.target.value;
										updateSpeakerProfile(speaker.id, {
											// Do not trim on each keystroke: trimming a trailing
											// space made "Chủ nhân" stop at "Chủ".
											addressPronoun: value.trim() ? value : undefined,
										});
									}}
									placeholder="Tự suy (vd: bạn, eng...)"
									className="h-6 w-full rounded-md border bg-background px-1.5 text-[10px] placeholder:text-[9px] placeholder:text-muted-foreground/60 focus:border-violet-500 focus:outline-hidden"
									aria-label={`Cách ${speaker.name} gọi đối phương`}
								/>
								<datalist id={`address-pronouns-${speaker.id}`}>
									{ADDRESS_PRONOUN_OPTIONS.map((pronoun) => (
										<option key={pronoun} value={pronoun} />
									))}
								</datalist>
							</label>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
