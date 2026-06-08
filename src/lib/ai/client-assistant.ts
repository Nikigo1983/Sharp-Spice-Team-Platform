import { createChatCompletion } from "@/lib/ai/openai";
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

  const text = await createChatCompletion(
    [
      {
        role: "system",
        content: `${TEAM_AI_SYSTEM_TONE} Клиент уже выбран — не проси уточнять имя.`,
      },
      {
        role: "user",
        content: `Контекст клиента:\n${context}\n\nЗапрос менеджера:\n${prompt}`,
      },
    ],
    { temperature: 0.55 },
  );
  if (text) return text;

  return buildFallbackResponse(detail, prompt, mode);
}

function buildFallbackResponse(
  detail: ClientDetail,
  prompt: string,
  mode: AiMode,
): string {
  const { client, surveys, documents, notes } = detail;

  if (mode === "summary") {
    return `## Краткое резюме
${client.name} — направление **${client.direction}**, статус **${client.status}**. Ответственный: ${client.manager}.

## Текущий статус
Последняя активность: ${client.lastActivity}. Анкет: ${surveys.length}, документов: ${documents.length}.

## Основные риски
${documents.length < 2 ? "⚠️ Не все базовые документы загружены." : "Критичных рисков по документам не видно."}
${client.status === "Новый" ? "⚠️ Клиент на ранней стадии — нужна квалификация." : ""}

## Следующие шаги
- Проверить комплект документов для ${client.direction}
- Согласовать follow-up после консультации
- Обновить статус в Google Sheets

## Рекомендации менеджеру
Уточнить готовность клиента по срокам и бюджету. ${
      notes.length
        ? `Учесть последнюю заметку: «${notes[0]?.text.slice(0, 120)}…»`
        : "Добавить заметку после следующего контакта."
    }

---
*Демо-режим: задайте OPENROUTER_API_KEY или OPENAI_API_KEY в .env.local.*`;
  }

  const lower = prompt.toLowerCase();

  if (lower.includes("резюме") || lower.includes("summary")) {
    return `${client.name}: ${client.direction}, ${client.status}. Менеджер ${client.manager}. ${surveys.length} анкет, ${documents.length} документов.`;
  }

  if (lower.includes("документ")) {
    const list =
      documents.length > 0
        ? documents.map((d) => `• ${d.category}: ${d.name}`).join("\n")
        : "Документы не загружены.";
    return `Для ${client.name} в системе:\n${list}\n\nРекомендуется проверить паспорт, справку о доходах и страховку для ${client.direction}.`;
  }

  if (lower.includes("сообщен") || lower.includes("follow")) {
    return `Здравствуйте, ${client.name.split(" ")[0]}!

Спасибо за обращение в Sharp & Spice. По вашему направлению (${client.direction}) мы подготовили следующие шаги. Готовы созвониться в удобное время.

С уважением,
${client.manager}`;
  }

  if (lower.includes("испани") && lower.includes("хорват")) {
    return `Для ${client.name} (${client.citizenship}, ${client.country}):
**Испания** — сильный рынок, больше программ, выше конкуренция.
**Хорватия** — Digital Nomad и локальные процедуры, часто быстрее старт для nomad-кейсов.
Рекомендация: сверить цели клиента со сроками и бюджетом из анкет.`;
  }

  return `По клиенту **${client.name}** (${client.id}):
Направление: ${client.direction}, статус: ${client.status}.
Анкет: ${surveys.length}, документов: ${documents.length}, заметок: ${notes.length}.

Ваш запрос: «${prompt.slice(0, 120)}»

*Подключите OPENROUTER_API_KEY или OPENAI_API_KEY для расширенных ответов. Контекст клиента уже передан в AI.*`;
}
