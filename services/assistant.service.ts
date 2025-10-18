// services/AssistantService.ts
import { OpenAI } from 'openai';
import Thread from '@/models/Thread.model';
import User from '@/models/User.model';
import vectorService from '@/services/vector.service';
import { system_message } from '../lib/const';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

type Role = 'system' | 'user' | 'assistant' | 'tool';

// Estructura mínima para nuestra BD
type DBMessage = {
  role: Role;
  content: string;
  timestamp: Date;
  // opcional: guarda metadatos de tool calls/resultados
  tool_call_id?: string;
  name?: string; // nombre de la función si role==='tool'
};

export class AssistantService {

  async getOrCreateThread(userId: string): Promise<string> {
    let user = await User.findOne({ userId });
    if (!user) user = await User.create({ userId });

    if (user.threadId) return user.threadId;

    const thread = await Thread.create({
      userId: user.userId,
      threadId: cryptoRandomId(),
      assistantId: 'responses-api', // informativo
      messages: [],
    });

    user.threadId = thread.threadId;
    await user.save();

    return thread.threadId;
  }


  async sendMessage(userId: string, message: string): Promise<string> {
    const threadId = await this.getOrCreateThread(userId);

    // 1) Traer historial y “ventanear” (p.ej. últimas 30 entradas)
    const history = await this.loadHistory(threadId, 30);

    // 2) Construir input para Responses: system + historial + nuevo user
    const input = this.buildInput(history, message);

    // 3) Definir tools (functions) disponibles en esta llamada
    const tools = this.getToolDefs();

    // 4) Loop de tool-calling hasta que obtengamos texto final
    const { finalText, updatedTranscript } =
      await this.runWithToolsLoop({ input, tools });

    // 5) Persistir en BD: user msg + assistant msg
    await this.appendToThread(threadId, [
      { role: 'user', content: message, timestamp: new Date() },
      ...updatedTranscript, // incluye tool results y la respuesta final
    ]);

    return finalText;
  }

  /**
   * Ejecuta Responses API y resuelve tool calls hasta respuesta final
   */
  private async runWithToolsLoop({
    input,
    tools,
    maxToolPasses = 5,
  }: {
    input: any[];
    tools: any[];
    maxToolPasses?: number;
  }): Promise<{ finalText: string; updatedTranscript: DBMessage[] }> {
    let transcript: DBMessage[] = [];
    let passes = 0;

    // Bucle: request → ¿tool calls? → ejecutar → inyectar resultados → repetir
    while (passes < maxToolPasses) {
      const response = await openai.responses.create({
        model: MODEL,
        input,
        instructions: system_message,
        tools,
        tool_choice: 'auto',
      });

      // 1) ¿Hay texto final?
      const text = safeOutputText(response);
      // 2) ¿Hay tool calls?
      const toolCalls = extractToolCalls(response);

      if (!toolCalls.length) {
        // No hay tools; tenemos texto final (o texto vacío pero sin tools)
        transcript.push({
          role: 'assistant',
          content: text ?? '',
          timestamp: new Date(),
        });
        return { finalText: text ?? '', updatedTranscript: transcript };
      }

      // Tenemos una o más tool calls → ejecutarlas
      const toolResults: DBMessage[] = [];

      for (const call of toolCalls) {
        const { id: tool_call_id, name, arguments: args } = call;
        const parsedArgs = safeJsonParse(args) ?? {};
        const output = await this.executeFunction(name, parsedArgs);

        // Guardamos el “tool result” en el transcript y lo reinyectamos al modelo
        toolResults.push({
          role: 'tool',
          content: JSON.stringify(output),
          timestamp: new Date(),
          tool_call_id,
          name,
        });

        // En Responses API “reinyectas” el resultado como parte del **input**
        input.push({
          role: 'tool',
          content: JSON.stringify(output),
          tool_call_id,
          name,
        });
      }

      transcript.push(...toolResults);
      passes += 1;

      // En la siguiente iteración, el modelo ve los tool results y produce texto final
      // (o vuelve a pedir otra tool).
    }

    // Si salimos por límite de pases, devolvemos lo último que tengamos
    transcript.push({
      role: 'assistant',
      content:
        'No pude completar la tarea porque se superó el máximo de pasos de herramientas.',
      timestamp: new Date(),
    });
    return {
      finalText:
        'No pude completar la tarea porque se superó el máximo de pasos de herramientas.',
      updatedTranscript: transcript,
    };
  }

  /** Construcción del input: system + historial + mensaje actual */
  private buildInput(history: DBMessage[], userMessage: string) {
    const input: any[] = [];

    // 1) Siempre un system al inicio (breve)
    if (system_message) {
      input.push({ role: 'system', content: system_message });
    }

    // 2) Historial (user/assistant/tool)
    for (const m of history) {
      const base = { role: m.role, content: m.content } as any;
      if (m.role === 'tool') {
        // Con Responses, conviene incluir tool_call_id y name si lo tienes
        if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
        if (m.name) base.name = m.name;
      }
      input.push(base);
    }

    // 3) Mensaje del usuario
    input.push({ role: 'user', content: userMessage });

    return input;
  }

  /** Trae mensajes del thread y devuelve los últimos N */
  private async loadHistory(threadId: string, max = 30): Promise<DBMessage[]> {
    const thread = await Thread.findOne({ threadId });
    if (!thread) return [];
    const messages = (thread.messages || []) as DBMessage[];
    return messages.slice(-max);
  }

  /** Inserta mensajes en el thread */
  private async appendToThread(threadId: string, messages: DBMessage[]) {
    await Thread.findOneAndUpdate(
      { threadId },
      { $push: { messages: { $each: messages } } },
      { upsert: true }
    );
  }

  /** Definición de tools (functions) para Responses API */
  private getToolDefs() {
    return [
      {
        type: 'function',
        function: {
          name: 'InfoInstitucional',
          description:
            'Información sobre: servicios, profesionales, matrículas, cobertura, responsables, ubicación, procesos, horarios, datos de contacto.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'La consulta de búsqueda. Debe ser específica y descriptiva.',
              },
              limit: {
                type: 'number',
                description:
                  'Número máximo de resultados a retornar (default: 5)',
                default: 5,
              },
              filter: {
                type: 'object',
                description:
                  'Filtros opcionales por metadata. Ej: {"empresa":"manzotti","info":"institucional"}',
                properties: {},
                additionalProperties: true,
              },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'Propiedades',
          description: 'Busca propiedades en la base de datos.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'La consulta de búsqueda. Debe ser específica y descriptiva.',
              },
              limit: {
                type: 'number',
                description:
                  'Número máximo de resultados a retornar (default: 5)',
                default: 5,
              },
              filter: {
                type: 'object',
                description:
                  'Filtros opcionales por metadata. Ej: {"empresa":"manzotti"}',
                properties: {},
                additionalProperties: true,
              },
            },
            required: ['query'],
          },
        },
      },
    ];
  }

  // ---------- Function calling: ejecutor de funciones ----------
  private async executeFunction(name: string, args: any): Promise<any> {
    console.log(`🔧 Ejecutando función: ${name} con parámetros`, args);
    switch (name) {
      case 'InfoInstitucional':
        return this.getInfoInstitucional(args.query, args.limit);

      case 'Propiedades':
        return this.getPropiedades(args.query, args.limit);

      default:
        return { error: `Función ${name} no implementada` };
    }
  }

  // ---------- Tus funciones de negocio ----------
  private async getInfoInstitucional(query: string, limit: number = 5) {
    try {
      console.log(`🔍 Buscando en knowledge base: "${query}"`);
      const results = await vectorService.searchSimilarDocuments(query, limit, {
        empresa: 'manzotti',
        info: 'institucional',
      });

      console.log(`✅ Encontrados ${results.length} resultados`);
      if (results.length === 0) {
        return {
          success: true,
          query,
          results_count: 0,
          message:
            'No se encontraron resultados relevantes en la base de conocimientos.',
        };
      }

      return {
        success: true,
        query,
        results_count: results.length,
        formatted_results: vectorService.formatResults(results),
        top_result: {
          content: results[0].content,
          similarity: results[0].similarity,
          metadata: results[0].metadata,
        },
      };
    } catch (error: any) {
      console.error('Error en búsqueda vectorial:', error);
      return {
        success: false,
        error: error.message,
        message:
          'Hubo un error al buscar en la base de conocimientos. Intenta más tarde.',
      };
    }
  }

  private async getPropiedades(query: string, limit = 5) {
    try {
      if (!query) return 'Falta query';

      console.log(`🔍 Buscando propiedades: "${query}"`);
      const results = await vectorService.searchSimilarDocuments(query, limit, {
        empresa: 'manzotti',
      });

      console.log(`✅ Encontrados ${results.length} resultados`);
      if (results.length === 0) {
        return {
          success: true,
          query,
          results_count: 0,
          message:
            'No se encontraron resultados relevantes en la base de conocimientos.',
        };
      }

      return {
        success: true,
        query,
        results_count: results.length,
        formatted_results: vectorService.formatResults(results),
        top_result: {
          content: results[0].content,
          similarity: results[0].similarity,
          metadata: results[0].metadata,
        },
      };
    } catch (error: any) {
      console.error('Error en búsqueda vectorial:', error);
      return {
        success: false,
        error: error.message,
        message:
          'Hubo un error al buscar en la base de conocimientos. Intenta más tarde.',
      };
    }
  }

  // ---------- Historial / reset ----------
  async getHistory(userId: string): Promise<any> {
    const user = await User.findOne({ userId });
    if (!user || !user.threadId) return { messages: [] };
    const thread = await Thread.findOne({ threadId: user.threadId });
    return thread || { messages: [] };
  }

  async resetThread(userId: string): Promise<string> {
    const user = await User.findOne({ userId });

    if (user?.threadId) {
      await Thread.findOneAndUpdate(
        { threadId: user.threadId },
        { metadata: { active: false } }
      );
    }

    const newThreadId = cryptoRandomId();

    if (user) {
      user.threadId = newThreadId;
      await user.save();
    }

    await Thread.create({
      threadId: newThreadId,
      userId,
      assistantId: 'responses-api',
      messages: [],
    });

    return newThreadId;
  }
}

// --------- Helpers ---------

function cryptoRandomId() {
  // ID corto legible; si prefieres ObjectId, usa el de Mongo
  return 'th_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Devuelve el texto final de Responses API (si existe).
 * `output_text` es una propiedad de conveniencia del SDK. 
 * Docs: Responses → output_text. 
 */
function safeOutputText(resp: any): string | null {
  try {
    if (resp?.output_text != null) return String(resp.output_text);
    // Fallback: algunos SDKs exponen `output` con bloques
    const out = resp?.output;
    if (Array.isArray(out)) {
      const textChunks: string[] = [];
      for (const item of out) {
        // Node SDK suele poner bloques tipo { type: 'message', content: [{ type:'text', text:'...' }] }
        if (item?.type === 'message' && Array.isArray(item?.content)) {
          for (const c of item.content) {
            if (c?.type === 'text' && typeof c?.text === 'string') {
              textChunks.push(c.text);
            }
          }
        }
      }
      if (textChunks.length) return textChunks.join('\n');
    }
  } catch {}
  return null;
}

/**
 * Extrae tool calls en varios formatos que el SDK puede devolver en Responses.
 * Estandarizamos a { id, name, arguments }.
 */
function extractToolCalls(resp: any): Array<{ id: string; name: string; arguments: string }> {
  const calls: Array<{ id: string; name: string; arguments: string }> = [];

  // 1) Formato Responses común: output -> blocks -> { type:'tool_call'/'tool_use', id, name, arguments }
  const out = resp?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      // Ej: item.type === 'tool_call' | 'tool_use' | 'message'
      if (item?.type === 'tool_call' || item?.type === 'tool_use') {
        if (item?.name && item?.id) {
          calls.push({
            id: String(item.id),
            name: String(item.name),
            arguments: typeof item.arguments === 'string'
              ? item.arguments
              : JSON.stringify(item.arguments ?? {}),
          });
        }
      }
      // Cuando viene como "message" con content blocks
      if (item?.type === 'message' && Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c?.type === 'tool_call' || c?.type === 'tool_use') {
            calls.push({
              id: String(c.id ?? cryptoRandomId()),
              name: String(c.name),
              arguments: typeof c.input === 'string'
                ? c.input
                : typeof c.arguments === 'string'
                  ? c.arguments
                  : JSON.stringify(c.input ?? c.arguments ?? {}),
            });
          }
        }
      }
    }
  }

  // 2) Fallback por si el SDK expone `tool_calls` a nivel raíz (poco común en Responses)
  if (Array.isArray(resp?.tool_calls)) {
    for (const t of resp.tool_calls) {
      calls.push({
        id: String(t.id ?? cryptoRandomId()),
        name: String(t.function?.name ?? t.name),
        arguments:
          typeof t.function?.arguments === 'string'
            ? t.function.arguments
            : JSON.stringify(t.function?.arguments ?? t.arguments ?? {}),
      });
    }
  }

  return calls;
}

function safeJsonParse(s: any) {
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}

export default new AssistantService();
