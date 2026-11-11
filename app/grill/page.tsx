import { LearningHome } from "@/components/learning-home";
import { readSettingsRecord } from "@/src/server";
import { slotsConfigured } from "@/src/core";
export const dynamic = "force-dynamic";
export default function GrillPage() { return <LearningHome entryPoint="grill" initialConfigured={slotsConfigured(readSettingsRecord()?.models)} />; }
