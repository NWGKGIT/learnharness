import { LearningHome } from "@/components/learning-home";
import { readSettingsRecord } from "@/src/server";
import { slotsConfigured } from "@/src/core";
export const dynamic = "force-dynamic";
export default async function LearnPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
	const { topic } = await searchParams;
	return <LearningHome initialTopic={topic ?? ""} initialConfigured={slotsConfigured(readSettingsRecord()?.models)} />;
}
