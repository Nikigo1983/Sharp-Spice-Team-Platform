/**
 * Accumulate fragmented streaming tool_calls by index.
 * Do not execute until finish.
 */

import type { ChatToolFunctionCall } from "@/lib/ai/openai";

type AccumulatorSlot = {
  id: string;
  name: string;
  arguments: string;
};

export class StreamToolCallAccumulator {
  private slots = new Map<number, AccumulatorSlot>();

  ingestDelta(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const data = payload as {
      choices?: {
        delta?: {
          tool_calls?: Array<{
            index?: number;
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }[];
    };
    const toolCalls = data.choices?.[0]?.delta?.tool_calls;
    if (!Array.isArray(toolCalls)) return;

    for (const call of toolCalls) {
      const index =
        typeof call.index === "number" && call.index >= 0 ? call.index : 0;
      const existing = this.slots.get(index) ?? {
        id: "",
        name: "",
        arguments: "",
      };
      if (typeof call.id === "string" && call.id) {
        existing.id = call.id;
      }
      if (typeof call.function?.name === "string" && call.function.name) {
        existing.name += call.function.name;
      }
      if (typeof call.function?.arguments === "string") {
        existing.arguments += call.function.arguments;
      }
      this.slots.set(index, existing);
    }
  }

  /** Complete tool calls only — never execute partial fragments. */
  finalize(): ChatToolFunctionCall[] {
    const indices = [...this.slots.keys()].sort((a, b) => a - b);
    const out: ChatToolFunctionCall[] = [];
    for (const index of indices) {
      const slot = this.slots.get(index);
      if (!slot || !slot.name.trim()) continue;
      out.push({
        id: slot.id.trim() || `tool_${index}`,
        type: "function",
        function: {
          name: slot.name.trim(),
          arguments: slot.arguments || "{}",
        },
      });
    }
    return out;
  }

  get size(): number {
    return this.slots.size;
  }
}
