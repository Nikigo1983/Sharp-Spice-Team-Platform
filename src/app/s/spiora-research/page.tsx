import type { Metadata } from "next";
import { SpioraSurveyPublicForm } from "@/components/spiora-survey/SpioraSurveyPublicForm";
import {
  SPIORA_SURVEY_CLIENT_TITLE,
} from "@/lib/spiora-survey/schema";

export const metadata: Metadata = {
  title: `${SPIORA_SURVEY_CLIENT_TITLE} · SPIORA`,
  description:
    "Короткое исследование рабочих процессов для продукта SPIORA.",
};

export default function SpioraResearchSurveyPage() {
  return <SpioraSurveyPublicForm />;
}
