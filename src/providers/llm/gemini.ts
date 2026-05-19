import { GoogleGenerativeAI, Tool, FunctionDeclaration } from '@google/generative-ai';
import { LLMProvider, ConversationMessage } from '../../llm';
import { getAvailableSlots, bookSlot } from '../../tools/calendar';

type GeminiRole = 'user' | 'model';
interface GeminiMessage {
  role: GeminiRole;
  parts: { text: string }[];
}

// Tool definitions — Gemini decides when to call these during the conversation
const calendarTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'get_available_slots',
        description: 'Get available 30-minute slots on the recruiter calendar for a given date',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: {
              type: 'STRING',
              description: 'Date in YYYY-MM-DD format, e.g. 2026-05-10',
            },
          },
          required: ['date'],
        },
      } as FunctionDeclaration,
      {
        name: 'book_slot',
        description: 'Book a follow-up call slot for the candidate with a human recruiter',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: {
              type: 'STRING',
              description: 'Date in YYYY-MM-DD format',
            },
            time: {
              type: 'STRING',
              description: 'Time in HH:MM format, e.g. 14:00',
            },
            candidate_name: {
              type: 'STRING',
              description: 'Full name of the candidate',
            },
            candidate_phone: {
              type: 'STRING',
              description: 'Phone number of the candidate',
            },
          },
          required: ['date', 'time', 'candidate_name', 'candidate_phone'],
        },
      } as FunctionDeclaration,
    ],
  },
];

export class GeminiLLM implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private history: GeminiMessage[] = [];
  private systemPrompt: string;

  constructor(systemPrompt: string) {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    this.systemPrompt = systemPrompt;
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.history.push({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text: content }],
    });
  }

  async respond(): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      systemInstruction: this.systemPrompt,
      tools: calendarTools,
    });

    // Gemini requires history to start with 'user' role
    const allHistory = this.history.slice(0, -1);
    const firstUserIdx = allHistory.findIndex((m) => m.role === 'user');
    const chatHistory = firstUserIdx >= 0 ? allHistory.slice(firstUserIdx) : [];

    const chat = model.startChat({ history: chatHistory });
    const lastMessage = this.history.at(-1)!.parts[0].text;

    let result = await chat.sendMessage(lastMessage);

    // Handle tool calls if Gemini decides to use one
    while (result.response.functionCalls()?.length) {
      const toolCall = result.response.functionCalls()![0];
      const toolResult = await this.executeTool(toolCall.name, toolCall.args as Record<string, string>);

      result = await chat.sendMessage([
        {
          functionResponse: {
            name: toolCall.name,
            response: { result: toolResult },
          },
        },
      ]);
    }

    return result.response.text();
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
        const booked = await bookSlot(
          args.date,
          args.time,
          args.candidate_name,
          args.candidate_phone
        );
        return `Successfully booked: ${booked}`;
      }

      return 'Unknown tool';
    } catch (err) {
      console.error(`[llm] Tool error (${name}):`, err);
      return 'Tool call failed — please try again';
    }
  }

  async *respondStream(): AsyncGenerator<string> {
    const model = this.genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      systemInstruction: this.systemPrompt,
      tools: calendarTools,
    });

    const allHistory = this.history.slice(0, -1);
    const firstUserIdx = allHistory.findIndex((m) => m.role === 'user');
    const chatHistory = firstUserIdx >= 0 ? allHistory.slice(firstUserIdx) : [];
    const chat = model.startChat({ history: chatHistory });
    const lastMessage = this.history.at(-1)!.parts[0].text;

    const streamResult = await chat.sendMessageStream(lastMessage);

    let streamedText = '';
    for await (const chunk of streamResult.stream) {
      const text = chunk.text();
      if (text) {
        streamedText += text;
        yield text;
      }
    }

    // If no text streamed, Gemini used a tool call — handle it and yield final response
    if (!streamedText) {
      const response = await streamResult.response;
      let currentResponse = response;

      while (currentResponse.functionCalls()?.length) {
        const toolCall = currentResponse.functionCalls()![0];
        const toolResult = await this.executeTool(toolCall.name, toolCall.args as Record<string, string>);

        const toolResponse = await chat.sendMessage([{
          functionResponse: {
            name: toolCall.name,
            response: { result: toolResult },
          },
        }]);
        currentResponse = toolResponse.response;
      }

      yield currentResponse.text();
    }
  }

  getHistory(): ConversationMessage[] {
    return this.history.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.parts[0].text,
    }));
  }
}
