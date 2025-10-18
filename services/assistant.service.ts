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

type DBMessage = {
    role: Role;
    content: string;
    timestamp: Date;
    tool_call_id?: string;
    name?: string;
};

export class AssistantService {

    async getOrCreateThread(userId: string): Promise<string> {
        let user = await User.findOne({ userId });
        if (!user) user = await User.create({ userId });

        if (user.threadId) return user.threadId;

        const thread = await Thread.create({
            userId: user.userId,
            threadId: cryptoRandomId(),
            assistantId: 'responses-api',
            messages: [],
        });

        user.threadId = thread.threadId;
        await user.save();

        return thread.threadId;
    }

    async sendMessage(userId: string, message: string): Promise<string> {
        const threadId = await this.getOrCreateThread(userId);

        const history = await this.loadHistory(threadId, 30);
        const input = this.buildInput(history, message);
        const tools = this.getToolDefs();

        const { finalText, updatedTranscript } =
            await this.runWithToolsLoop({ input, tools });

        await this.appendToThread(threadId, [
            { role: 'user', content: message, timestamp: new Date() },
            ...updatedTranscript,
        ]);

        return finalText;
    }

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

        while (passes < maxToolPasses) {
            console.log(`\n🔄 Tool Loop - Pass ${passes + 1}`);
            console.log(`📋 Input messages count: ${input.length}`);
            console.log(`📋 Last user message:`, input.filter(m => m.role === 'user').slice(-1)[0]?.content?.substring(0, 100));
            console.log(`🔧 Tools available:`, tools.map(t => t.name));
            
            const response = await openai.responses.create({
                model: MODEL,
                input,
                instructions: system_message,
                tools,
            });

            // Log completo de la respuesta para debugging
            console.log(`\n📦 Full response output:`, JSON.stringify(response.output, null, 2));
            console.log(`\n📦 Response metadata:`, {
                id: response.id,
                status: response.status,
                model: response.model,
                hasOutput: !!response.output,
                outputLength: Array.isArray(response.output) ? response.output.length : 0
            });

            const text = safeOutputText(response);
            const toolCalls = extractToolCalls(response);

            console.log(`📤 Response text: ${text?.substring(0, 100) || '(none)'}...`);
            console.log(`🔧 Tool calls detected: ${toolCalls.length}`);

            if (!toolCalls.length) {
                transcript.push({
                    role: 'assistant',
                    content: text ?? '',
                    timestamp: new Date(),
                });
                return { finalText: text ?? '', updatedTranscript: transcript };
            }

            // Para Responses API, NO agregamos el mensaje del asistente con tool_calls
            // En su lugar, agregamos directamente los tool results
            // El modelo infiere las tool calls del output anterior
            
            console.log(`\n🔧 Executing ${toolCalls.length} tool(s)...`);
            const toolResults: DBMessage[] = [];

            for (const call of toolCalls) {
                const { id: tool_call_id, name, arguments: args } = call;
                console.log(`\n🔧 Executing tool: ${name}`);
                console.log(`📝 Arguments: ${args.substring(0, 100)}...`);
                
                const parsedArgs = safeJsonParse(args) ?? {};
                const output = await this.executeFunction(name, parsedArgs);

                console.log(`✅ Tool result: ${JSON.stringify(output).substring(0, 100)}...`);

                toolResults.push({
                    role: 'tool',
                    content: JSON.stringify(output),
                    timestamp: new Date(),
                    tool_call_id,
                    name,
                });

                // Para Responses API, el formato correcto es 'function_call_output'
                input.push({
                    type: 'function_call_output',
                    call_id: tool_call_id,
                    output: JSON.stringify(output),
                });
            }

            transcript.push(...toolResults);
            passes += 1;
        }

        transcript.push({
            role: 'assistant',
            content: 'No pude completar la tarea porque se superó el máximo de pasos de herramientas.',
            timestamp: new Date(),
        });
        return {
            finalText: 'No pude completar la tarea porque se superó el máximo de pasos de herramientas.',
            updatedTranscript: transcript,
        };
    }

    private buildInput(history: DBMessage[], userMessage: string) {
        const input: any[] = [];

        if (system_message) {
            input.push({ role: 'system', content: system_message });
        }

        for (const m of history) {
            const base = { role: m.role, content: m.content } as any;
            if (m.role === 'tool') {
                if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
                if (m.name) base.name = m.name;
            }
            input.push(base);
        }

        input.push({ role: 'user', content: userMessage });

        return input;
    }

    private async loadHistory(threadId: string, max = 30): Promise<DBMessage[]> {
        const thread = await Thread.findOne({ threadId });
        if (!thread) return [];
        const messages = (thread.messages || []) as DBMessage[];
        return messages.slice(-max);
    }

    private async appendToThread(threadId: string, messages: DBMessage[]) {
        await Thread.findOneAndUpdate(
            { threadId },
            { $push: { messages: { $each: messages } } },
            { upsert: true }
        );
    }

    private getToolDefs() {
        return [
            {
                type: 'function',
                name: 'InfoInstitucional',
                description: 'Busca información institucional sobre servicios, profesionales, matrículas, cobertura médica, responsables, ubicación física, procesos administrativos, horarios de atención y datos de contacto de la empresa Manzotti.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'La consulta de búsqueda. Debe ser específica y descriptiva sobre qué información institucional se necesita.',
                        },
                        limit: {
                            type: 'number',
                            description: 'Número máximo de resultados a retornar',
                            default: 5,
                        },
                    },
                    required: ['query'],
                },
            },
            {
                type: 'function',
                name: 'Propiedades',
                description: 'Busca propiedades inmobiliarias disponibles en la base de datos de Manzotti. Usa esta herramienta cuando el usuario pregunte por casas, departamentos, terrenos, alquileres o ventas.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Descripción de la propiedad buscada: tipo (casa, depto), ubicación, características, precio, etc.',
                        },
                        limit: {
                            type: 'number',
                            description: 'Número máximo de resultados a retornar',
                            default: 5,
                        },
                    },
                    required: ['query'],
                },
            },
        ];
    }

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
                    message: 'No se encontraron resultados relevantes en la base de conocimientos.',
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
                message: 'Hubo un error al buscar en la base de conocimientos. Intenta más tarde.',
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
                    message: 'No se encontraron resultados relevantes en la base de conocimientos.',
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
                message: 'Hubo un error al buscar en la base de conocimientos. Intenta más tarde.',
            };
        }
    }

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
    return 'th_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function safeOutputText(resp: any): string | null {
    try {
        if (resp?.output_text != null) {
            const s = String(resp.output_text).trim();
            if (s) return s;
        }

        const out = resp?.output;
        if (!Array.isArray(out)) return null;

        const chunks: string[] = [];

        for (const item of out) {
            if (item?.type === 'message' && Array.isArray(item?.content)) {
                for (const c of item.content) {
                    if (c?.type === 'output_text') {
                        const v = typeof c?.text === 'string' ? c.text : 
                                  typeof c?.text?.value === 'string' ? c.text.value : '';
                        if (v) chunks.push(v);
                    }

                    if (c?.type === 'text') {
                        const v = typeof c?.text === 'string' ? c.text :
                                  typeof c?.text?.value === 'string' ? c.text.value : '';
                        if (v) chunks.push(v);
                    }
                }
            }

            if (item?.type === 'output_text') {
                const v = typeof item?.text === 'string' ? item.text :
                          typeof item?.text?.value === 'string' ? item.text.value : '';
                if (v) chunks.push(v);
            }
        }

        const joined = chunks.join('\n').trim();
        return joined || null;
    } catch {
        return null;
    }
}

function extractToolCalls(resp: any): Array<{ id: string; name: string; arguments: string }> {
    const calls: Array<{ id: string; name: string; arguments: string }> = [];
    
    console.log('\n🔍 Extracting tool calls from response...');
    
    const out = resp?.output;
    console.log('Output type:', Array.isArray(out) ? `array[${out.length}]` : typeof out);

    if (Array.isArray(out)) {
        out.forEach((item, idx) => {
            console.log(`\n  Item ${idx}:`, {
                type: item?.type,
                hasName: !!item?.name,
                hasCallId: !!item?.call_id,
                hasArguments: !!item?.arguments,
                keys: Object.keys(item || {})
            });

            // Caso 1: function_call (formato Responses API)
            if (item?.type === 'function_call' && item?.name) {
                console.log(`    ✅ Found function_call: ${item.name}`);
                calls.push({
                    id: String(item?.call_id ?? item?.id ?? cryptoRandomId()),
                    name: String(item.name),
                    arguments: typeof item?.arguments === 'string' ? item.arguments :
                               JSON.stringify(item?.arguments ?? {}),
                });
            }

            // Caso 2: tool_use o tool_call
            if ((item?.type === 'tool_use' || item?.type === 'tool_call') && item?.name) {
                console.log(`    ✅ Found tool_use: ${item.name}`);
                calls.push({
                    id: String(item?.id ?? cryptoRandomId()),
                    name: String(item.name),
                    arguments: typeof item?.input === 'string' ? item.input :
                               typeof item?.arguments === 'string' ? item.arguments :
                               JSON.stringify(item?.input ?? item?.arguments ?? {}),
                });
            }

            // Caso 3: message con content[]
            if (item?.type === 'message' && Array.isArray(item?.content)) {
                console.log(`    Message with ${item.content.length} content items`);
                item.content.forEach((c: any, cidx: number) => {
                    console.log(`      Content ${cidx}:`, {
                        type: c?.type,
                        hasName: !!c?.name,
                        keys: Object.keys(c || {})
                    });
                    
                    if (c?.type === 'function_call' && c?.name) {
                        console.log(`      ✅ Found function_call in content: ${c.name}`);
                        calls.push({
                            id: String(c?.call_id ?? c?.id ?? cryptoRandomId()),
                            name: String(c.name),
                            arguments: typeof c?.arguments === 'string' ? c.arguments :
                                       JSON.stringify(c?.arguments ?? {}),
                        });
                    }
                    
                    if ((c?.type === 'tool_use' || c?.type === 'tool_call') && c?.name) {
                        console.log(`      ✅ Found tool in content: ${c.name}`);
                        calls.push({
                            id: String(c?.id ?? cryptoRandomId()),
                            name: String(c.name),
                            arguments: typeof c?.input === 'string' ? c.input :
                                       typeof c?.arguments === 'string' ? c.arguments :
                                       JSON.stringify(c?.input ?? c?.arguments ?? {}),
                        });
                    }
                });
            }
        });
    }

    // Fallback para formato alternativo
    if (Array.isArray(resp?.tool_calls)) {
        console.log(`  Found ${resp.tool_calls.length} tool_calls at root level`);
        for (const t of resp.tool_calls) {
            calls.push({
                id: String(t?.id ?? cryptoRandomId()),
                name: String(t?.function?.name ?? t?.name),
                arguments: typeof t?.function?.arguments === 'string' ? t.function.arguments :
                           JSON.stringify(t?.function?.arguments ?? t?.arguments ?? {}),
            });
        }
    }

    console.log(`\n🎯 Total tool calls found: ${calls.length}`);
    if (calls.length > 0) {
        console.log('📋 Tool calls:', calls.map(c => `${c.name}(${c.arguments.substring(0, 50)}...)`));
    }
    return calls;
}

function safeJsonParse(s: any) {
    if (typeof s !== 'string') return s;
    try { return JSON.parse(s); } catch { return null; }
}

export default new AssistantService();