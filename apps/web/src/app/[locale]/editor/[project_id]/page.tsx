"use client";

import { useParams } from "next/navigation";
import { lazy, Suspense } from "react";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { AgentPanel } from "@/components/editor/panels/agent";
import { SubtitlePanel } from "@/components/editor/panels/subtitles";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/components/editor/panels/timeline";
import { PreviewPanel } from "@/components/editor/panels/preview";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/providers/editor-provider";
// import { Onboarding } from "@/components/editor/onboarding";
import { MigrationDialog } from "@/components/editor/dialogs/migration-dialog";
import { usePanelStore } from "@/stores/panel-store";
import { useAgentStore } from "@/stores/agent-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEditor } from "@/hooks/use-editor";

const MobileEditorLayout = lazy(() =>
	import("@/components/editor/mobile/mobile-editor-layout").then((m) => ({
		default: m.MobileEditorLayout,
	})),
);

export default function Editor() {
	const params = useParams();
	const projectId = params.project_id as string;

	return (
		<EditorProvider projectId={projectId}>
			<EditorShell />
		</EditorProvider>
	);
}

function EditorShell() {
	const isMobile = useIsMobile();

	return (
		<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
			{isMobile ? (
				<Suspense
					fallback={
						<div className="flex h-screen items-center justify-center">
							Loading...
						</div>
					}
				>
					<MobileEditorLayout />
				</Suspense>
			) : (
				<>
					<EditorHeader />
					<div className="min-h-0 min-w-0 flex-1 px-3 pb-3">
						<EditorLayout />
					</div>
				</>
			)}
			{/* <Onboarding /> */}
			<MigrationDialog />
		</div>
	);
}

function EditorLayout() {
	const { panels, setPanel, isSubtitlesOpen } = usePanelStore();
	const isAgentOpen = useAgentStore((s) => s.isOpen);
	const editor = useEditor();
	const layoutMode = editor.project.getLayoutMode();
	const isVertical = layoutMode === "vertical";

	if (isVertical) {
		// Vertical: Preview is a full-height sibling on the right.
		// Left side = Assets|Properties (top) + Timeline (bottom).
		const leftDefault =
			100 -
			panels.preview -
			(isSubtitlesOpen ? panels.subtitles : 0) -
			(isAgentOpen ? panels.agent : 0);

		return (
			<ResizablePanelGroup
				direction="horizontal"
				className="size-full gap-[0.19rem]"
				onLayout={(sizes) => {
					setPanel("preview", sizes[1] ?? panels.preview);
					let nextPanelIndex = 2;
					if (isSubtitlesOpen) {
						setPanel("subtitles", sizes[nextPanelIndex] ?? panels.subtitles);
						nextPanelIndex += 1;
					}
					if (isAgentOpen && sizes[nextPanelIndex] != null) {
						setPanel("agent", sizes[nextPanelIndex]);
					}
				}}
			>
				<ResizablePanel
					id="vertical-left"
					order={1}
					defaultSize={leftDefault}
					minSize={30}
					className="min-w-0"
				>
					<ResizablePanelGroup
						direction="vertical"
						className="size-full gap-[0.18rem]"
						onLayout={(sizes) => {
							setPanel("mainContent", sizes[0] ?? panels.mainContent);
							setPanel("timeline", sizes[1] ?? panels.timeline);
						}}
					>
						<ResizablePanel
							id="vertical-main-content"
							order={1}
							defaultSize={panels.mainContent}
							minSize={30}
							maxSize={85}
							className="min-h-0"
						>
							<ResizablePanelGroup
								direction="horizontal"
								className="size-full gap-[0.19rem]"
								onLayout={(sizes) => {
									setPanel("tools", sizes[0] ?? panels.tools);
									setPanel("properties", sizes[1] ?? panels.properties);
								}}
							>
								<ResizablePanel
									id="vertical-tools"
									order={1}
									defaultSize={panels.tools}
									minSize={15}
									maxSize={40}
									className="min-w-0"
								>
									<AssetsPanel />
								</ResizablePanel>

								<ResizableHandle withHandle />

								<ResizablePanel
									id="vertical-properties"
									order={2}
									defaultSize={panels.properties}
									minSize={15}
									maxSize={40}
									className="min-w-0"
								>
									<PropertiesPanel />
								</ResizablePanel>
							</ResizablePanelGroup>
						</ResizablePanel>

						<ResizableHandle withHandle />

						<ResizablePanel
							id="vertical-timeline"
							order={2}
							defaultSize={panels.timeline}
							minSize={15}
							maxSize={70}
							className="min-h-0"
						>
							<Timeline />
						</ResizablePanel>
					</ResizablePanelGroup>
				</ResizablePanel>

				<ResizableHandle withHandle />

				<ResizablePanel
					id="vertical-preview"
					order={2}
					defaultSize={panels.preview}
					minSize={30}
					className="min-w-0"
				>
					<PreviewPanel />
				</ResizablePanel>

				{isSubtitlesOpen && (
					<>
						<ResizableHandle withHandle />
						<ResizablePanel
							id="vertical-subtitles"
							order={3}
							defaultSize={panels.subtitles}
							minSize={18}
							maxSize={38}
							className="min-w-0"
						>
							<SubtitlePanel />
						</ResizablePanel>
					</>
				)}

				{isAgentOpen && (
					<>
						<ResizableHandle withHandle />
						<ResizablePanel
							id="vertical-agent"
							order={isSubtitlesOpen ? 4 : 3}
							defaultSize={panels.agent}
							minSize={15}
							maxSize={35}
							className="min-w-0"
						>
							<AgentPanel />
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>
		);
	}

	// Landscape (default): Assets | Preview | Properties (top) + Timeline (bottom)
	return (
		<ResizablePanelGroup
			direction="horizontal"
			className="size-full gap-[0.19rem]"
			onLayout={(sizes) => {
				let nextPanelIndex = 1;
				if (isSubtitlesOpen) {
					setPanel("subtitles", sizes[nextPanelIndex] ?? panels.subtitles);
					nextPanelIndex += 1;
				}
				if (isAgentOpen && sizes[nextPanelIndex] != null) {
					setPanel("agent", sizes[nextPanelIndex]);
				}
			}}
		>
			<ResizablePanel
				id="landscape-main"
				order={1}
				defaultSize={
					100 -
					(isSubtitlesOpen ? panels.subtitles : 0) -
					(isAgentOpen ? panels.agent : 0)
				}
				minSize={50}
				className="min-w-0"
			>
				<ResizablePanelGroup
					direction="vertical"
					className="size-full gap-[0.18rem]"
					onLayout={(sizes) => {
						setPanel("mainContent", sizes[0] ?? panels.mainContent);
						setPanel("timeline", sizes[1] ?? panels.timeline);
					}}
				>
					<ResizablePanel
						id="landscape-main-content"
						order={1}
						defaultSize={panels.mainContent}
						minSize={30}
						maxSize={85}
						className="min-h-0"
					>
						<ResizablePanelGroup
							direction="horizontal"
							className="size-full gap-[0.19rem]"
							onLayout={(sizes) => {
								setPanel("tools", sizes[0] ?? panels.tools);
								setPanel("preview", sizes[1] ?? panels.preview);
								setPanel("properties", sizes[2] ?? panels.properties);
							}}
						>
							<ResizablePanel
								id="landscape-tools"
								order={1}
								defaultSize={panels.tools}
								minSize={15}
								maxSize={40}
								className="min-w-0"
							>
								<AssetsPanel />
							</ResizablePanel>

							<ResizableHandle withHandle />

							<ResizablePanel
								id="landscape-preview"
								order={2}
								defaultSize={panels.preview}
								minSize={30}
								className="min-h-0 min-w-0 flex-1"
							>
								<PreviewPanel />
							</ResizablePanel>

							<ResizableHandle withHandle />

							<ResizablePanel
								id="landscape-properties"
								order={3}
								defaultSize={panels.properties}
								minSize={15}
								maxSize={40}
								className="min-w-0"
							>
								<PropertiesPanel />
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						id="landscape-timeline"
						order={2}
						defaultSize={panels.timeline}
						minSize={15}
						maxSize={70}
						className="min-h-0"
					>
						<Timeline />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			{isSubtitlesOpen && (
				<>
					<ResizableHandle withHandle />
					<ResizablePanel
						id="landscape-subtitles"
						order={2}
						defaultSize={panels.subtitles}
						minSize={18}
						maxSize={38}
						className="min-w-0"
					>
						<SubtitlePanel />
					</ResizablePanel>
				</>
			)}

			{isAgentOpen && (
				<>
					<ResizableHandle withHandle />
					<ResizablePanel
						id="landscape-agent"
						order={isSubtitlesOpen ? 3 : 2}
						defaultSize={panels.agent}
						minSize={15}
						maxSize={35}
						className="min-w-0"
					>
						<AgentPanel />
					</ResizablePanel>
				</>
			)}
		</ResizablePanelGroup>
	);
}
