import { LLMProvider, ConversationMessage } from '../../llm';
import { getAvailableSlots, bookSlot } from '../../tools/calendar';

const ILMU_URL = 'https://api.ilmu.ai/v1/chat/completions';

interface IlmuTextMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface IlmuToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

// Same OpenAI-compatible working-message shape as OpenRouterLLM in
// voice-agent-v2, tool-call round-trips live only in this per-request
// array, never in `history`.
interface IlmuWorkingMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: IlmuToolCall[];
  tool_call_id?: string;
}

// Same OpenAI function-calling shape as OpenRouterLLM's buildTools(),
// mirrors GeminiLLM's calendarTools one-for-one so behavior matches
// regardless of which provider is selected.
const calendarTools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_available_slots',
      description: 'Get available 30-minute slots on the recruiter calendar for a given date',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format, e.g. 2026-05-10' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'book_slot',
      description: 'Book a follow-up call slot for the candidate with a human recruiter',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          time: { type: 'string', description: 'Time in HH:MM format, e.g. 14:00' },
          candidate_name: { type: 'string', description: 'Full name of the candidate' },
          candidate_phone: { type: 'string', description: 'Phone number of the candidate' },
        },
        required: ['date', 'time', 'candidate_name', 'candidate_phone'],
      },
    },
  },
];

function safeParseArgs(raw: string): Record<string, any> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ILMU (YTL AI Labs) is an OpenAI-compatible endpoint hosted in Malaysia,
// standard /v1/chat/completions shape and SSE streaming. Drop-in swap for
// GeminiLLM, same LLMProvider interface and same two calendar tools.
export class IlmuLLM implements LLMProvider {
  private apiKey: string;
  private model: string;
  private systemPrompt: string;
  private history: IlmuTextMessage[] = [];

  constructor(systemPrompt: string) {
    this.apiKey = process.env.ILMU_API_KEY!;
    this.model = process.env.ILMU_MODEL ?? 'nemo-super';
    this.systemPrompt = systemPrompt;
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.history.push({ role, content });
  }

  private buildInitialMessages(): IlmuWorkingMessage[] {
    return [{ role: 'system', content: this.systemPrompt }, ...this.history];
  }

  private async request(messages: IlmuWorkingMessage[], stream: boolean): Promise<Response> {
    const res = await fetch(ILMU_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages, tools: calendarTools, stream }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ILMU error ${res.status}: ${err}`);
    }
    return res;
  }

  private async executeTool(name: string, args: Record<string, string>): Promise<string> {
    console.log(`[llm] Tool call: ${name}`, args);

    try {
      if (name === 'get_available_slots') {
        const slots = await getAvailableSlots(args.date);
        return slots.length > 0
          ? `Available slots: ${slots.join(', ')}`
          : 'No available slots on that date';
      }

      if (name === 'book_slot') {
        const booked = await bookSlot(args.date, args.time, args.candidate_name, args.candidate_phone);
        return `Successfully booked: ${booked}`;
      }

      return 'Unknown tool';
    } catch (err) {
      console.error(`[llm] Tool error (${name}):`, err);
      return 'Tool call failed, please try again';
    }
  }

  async respond(): Promise<string> {
    const messages = this.buildInitialMessages();
    while (true) {
      const res = await this.request(messages, false);
      const data = (await res.json()) as { choices: [{ message: IlmuWorkingMessage & { tool_calls?: IlmuToolCall[] } }] };
      const choice = data.choices[0].message;

      if (choice.tool_calls?.length) {
        messages.push(choice);
        for (const call of choice.tool_calls) {
          const result = await this.executeTool(call.function.name, safeParseArgs(call.function.arguments) as Record<string, string>);
          messages.push({ role: 'tool', tool_call_id: call.id, content: result });
        }
        continue;
      }
      return choice.content ?? '';
    }
  }

  async *respondStream(): AsyncGenerator<string> {
    const messages = this.buildInitialMessages();

    while (true) {
      const res = await this.request(messages, true);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedText = '';
      const toolCalls: Record<number, { id: string; name: string; arguments: string }> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;

          let evt: any;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = evt.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            streamedText += delta.content;
            yield delta.content;
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id ?? '', name: '', arguments: '' };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
            }
          }
        }
      }

      const calls = Object.values(toolCalls);
      if (calls.length === 0) return;

      messages.push({
        role: 'assistant',
        content: streamedText || null,
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })),
      });
      for (const call of calls) {
        const result = await this.executeTool(call.name, safeParseArgs(call.arguments) as Record<string, string>);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
  }

  getHistory(): ConversationMessage[] {
    return this.history.map((m) => ({ role: m.role, content: m.content }));
  }
}
