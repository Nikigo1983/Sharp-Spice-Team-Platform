import { AiCompletionError } from "@/lib/ai/errors";
import { createChatCompletionResult } from "@/lib/ai/openai";
import { getAuxiliaryLlmModel } from "@/lib/ai/models";
import { TEAM_AI_SYSTEM_TONE } from "@/lib/ai/tone";
import { buildClientAiContext } from "@/lib/google-sheets/service";
import type { ClientDetail } from "@/lib/google-sheets/types";

export type AiMode = "chat" | "summary";

const SUMMARY_PROMPT = `Создай структурированное резюме клиента на русском языке по разделам:
1. Краткое резюме клиента
2. Текущий статус
3. Основные риски
4. Следующие шаги
5. Рекомендации менеджеру

Используй только факты из контекста. Если данных недостаточно — укажи это.`;

export async function runClientAi(
  detail: ClientDetail,
  userMessage: string,
  mode: AiMode = "chat",
): Promise<string> {
  const context = buildClientAiContext(detail);
  const prompt =
    mode === "summary"
      ? SUMMARY_PROMPT
      : userMessage.trim() || "Дай краткий ответ по клиенту.";

  const result = await createChatCompletionResult(
    [
      {
        role: "system",
        content: `${TEAM_AI_SYSTEM_TONE} Клиент уже выбран — не проси уточнять имя. В контексте перечислены все колонки таблицы «Клиенты» (даты, букинг, референт, заметки и т.д.). Отвечай только по этим данным; если поля нет — скажи, что в таблице не указано.`,
      },
      {
        role: "user",
        content: `Контекст клиента:\n${context}\n\nЗапрос менеджера:\n${prompt}`,
      },
    ],
    { temperature: 0.55, model: getAuxiliaryLlmModel() },
  );
  if (!result.ok || !result.content) throw new AiCompletionError(result.error);
  return result.content;
}
