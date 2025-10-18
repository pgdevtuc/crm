import { OpenAI } from 'openai';
import Thread from '@/models/Thread.model';
import User from '@/models/User.model';
import vectorService from '@/services/vector.service';
import { system_message } from '../lib/const';


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.ASSISTANT_ID || "";

export class AssistantService {

    // Crear o recuperar thread para un usuario
    async getOrCreateThread(userId: string): Promise<string> {
        let user = await User.findOne({ userId });

        if (!user) {
            user = await User.create({ userId });
        }

        if (user.threadId) {
            return user.threadId;
        }

        const thread = await openai.beta.threads.create();

        user.threadId = thread.id;
        await user.save();

        await Thread.create({
            threadId: thread.id,
            userId: user.userId,
            assistantId: ASSISTANT_ID,
            messages: []
        });

        return thread.id;
    }

    // Enviar mensaje y obtener respuesta con manejo de tools
    async sendMessage(userId: string, message: string): Promise<string> {
        const threadId = await this.getOrCreateThread(userId);

        // Agregar mensaje al thread
        await openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: message
        });

        // Ejecutar el asistente
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: ASSISTANT_ID,

        });

        // Esperar a que termine y manejar required_action si hay function calling
        let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);

        while (runStatus.status !== 'completed') {
            if (runStatus.status === 'failed' || runStatus.status === 'cancelled') {
                throw new Error(`Run failed with status: ${runStatus.status}`);
            }

            // Si el asistente requiere que ejecutemos una función
            if (runStatus.status === 'requires_action') {
                await this.handleRequiredAction(threadId, run.id, runStatus);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        }

        // Obtener mensajes
        const messages = await openai.beta.threads.messages.list(threadId);
        const lastMessage = messages.data[0];

        if (lastMessage.role !== 'assistant') {
            throw new Error('No assistant response found');
        }

        const response = lastMessage.content[0];
        const responseText = response.type === 'text' ? response.text.value : '';

        // Guardar en BD
        await Thread.findOneAndUpdate(
            { threadId },
            {
                $push: {
                    messages: [
                        { role: 'user', content: message, timestamp: new Date() },
                        { role: 'assistant', content: responseText, timestamp: new Date() }
                    ]
                }
            }
        );

        return responseText;
    }

    // Manejar function calling
    private async handleRequiredAction(
        threadId: string,
        runId: string,
        runStatus: any
    ): Promise<void> {
        const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls;

        if (!toolCalls) return;

        const toolOutputs = [];

        for (const toolCall of toolCalls) {
            if (toolCall.type === 'function') {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);

                // Ejecutar la función correspondiente
                const output = await this.executeFunction(functionName, functionArgs);

                toolOutputs.push({
                    tool_call_id: toolCall.id,
                    output: JSON.stringify(output)
                });
            }
        }

        // Enviar los resultados de las funciones
        if (toolOutputs.length > 0) {
            await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
                tool_outputs: toolOutputs
            });
        }
    }

    // Ejecutar funciones personalizadas
    private async executeFunction(name: string, args: any): Promise<any> {
        console.log(`🔧 Ejecutando funcióooooooooonnnnn: ${name} con parametros ${args}`);
        switch (name) {
            case 'InfoInstitucional':
                return this.getInfoInstitucional(args.query, args.limit);

            case 'Propiedades':
                return this.getPropiedades(args.query, args.limit);

            default:
                return { error: `Función ${name} no implementada` };
        }
    }

    // Nueva función: búsqueda en base de datos vectorial
    private async getInfoInstitucional(query: string, limit: number = 5) {
        try {
            console.log(`🔍 Buscando en knowledge base: "${query}"`);

            const results = await vectorService.searchSimilarDocuments(
                query,
                limit,
                { empresa: "manzotti", info: "institucional" } // Filtros opcionales por metadata
            );

            console.log(`✅ Encontrados ${results.length} resultados`);

            if (results.length === 0) {
                return {
                    success: true,
                    query,
                    results_count: 0,
                    message: 'No se encontraron resultados relevantes en la base de conocimientos. Informa al usuario que no tienes esa información específica disponible.'
                };
            }

            // Retornar resultados formateados para que el asistente los procese
            return {
                success: true,
                query,
                results_count: results.length,
                formatted_results: vectorService.formatResults(results),
                top_result: {
                    content: results[0].content,
                    similarity: results[0].similarity,
                    metadata: results[0].metadata
                }
            };
        } catch (error: any) {
            console.error('Error en búsqueda vectorial:', error);
            return {
                success: false,
                error: error.message,
                message: 'Hubo un error al buscar en la base de conocimientos. Informa al usuario que no puedes acceder a esa información en este momento.'
            };
        }
    }

    private async getPropiedades(query: string, limit = 5) {
        try {
            if (!query) return "Falta query";

            console.log(`🔍 Buscando en knowledge base: "${query}"`);


            const results = await vectorService.searchSimilarDocuments(
                query,
                limit,
                { empresa: "manzotti" }// Filtros opcionales por metadata
            );

            console.log(`✅ Encontrados ${results.length} resultados`);

            if (results.length === 0) {
                return {
                    success: true,
                    query,
                    results_count: 0,
                    message: 'No se encontraron resultados relevantes en la base de conocimientos. Informa al usuario que no tienes esa información específica disponible.'
                };
            }

            // Retornar resultados formateados para que el asistente los procese
            return {
                success: true,
                query,
                results_count: results.length,
                formatted_results: vectorService.formatResults(results),
                top_result: {
                    content: results[0].content,
                    similarity: results[0].similarity,
                    metadata: results[0].metadata
                }
            };
        } catch (error: any) {
            console.error('Error en búsqueda vectorial:', error);
            return {
                success: false,
                error: error.message,
                message: 'Hubo un error al buscar en la base de conocimientos. Informa al usuario que no puedes acceder a esa información en este momento.'
            };
        }
    }

    // Ejemplo: función de clima
    private async getWeather(location: string) {
        // Aquí harías una llamada a una API real
        return {
            location,
            temperature: 25,
            condition: 'soleado',
            humidity: 60
        };
    }


    // Actualizar asistente con nuevas tools
    async updateAssistantTools() {
        await openai.beta.assistants.update(ASSISTANT_ID, {
            instructions: system_message,
            tools: [
                { type: 'code_interpreter' },
                { type: 'file_search' },
                {
                    type: 'function',
                    function: {
                        name: 'InfoInstitucional',
                        description: 'Información sobre: servicios, profesionales, matrículas, cobertura, responsables, ubicación, procesos, horarios, datos de contacto.',
                        parameters: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'La consulta de búsqueda. Debe ser específica y descriptiva.'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Número máximo de resultados a retornar (default: 5)',
                                    default: 5
                                },
                                filter: {
                                    type: 'object',
                                    description: 'Filtros opcionales para búsqueda por metadata. Ejemplo: {"empresa": "manzotti", "info": "institucional"}',
                                    properties: {},
                                    additionalProperties: true
                                }
                            },
                            required: ['query']
                        }
                    }
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
                                    description: 'La consulta de búsqueda. Debe ser específica y descriptiva.'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Número máximo de resultados a retornar (default: 5)',
                                    default: 5
                                },
                                filter: {
                                    type: 'object',
                                    description: 'Filtros opcionales para búsqueda por metadata. Ejemplo: {"empresa": "manzotti"}',
                                    properties: {},
                                    additionalProperties: true
                                }
                            },
                            required: ['query']
                        }
                    }
                },
            ]
        });
        console.log('✅ Tools actualizadas en el asistente');
    }

    async getHistory(userId: string): Promise<any> {
        const user = await User.findOne({ userId });

        if (!user || !user.threadId) {
            return { messages: [] };
        }

        const thread = await Thread.findOne({ threadId: user.threadId });
        return thread || { messages: [] };
    }

    async resetThread(userId: string): Promise<string> {
        const user = await User.findOne({ userId });

        if (user && user.threadId) {
            await Thread.findOneAndUpdate(
                { threadId: user.threadId },
                { metadata: { active: false } }
            );
        }

        const thread = await openai.beta.threads.create();

        if (user) {
            user.threadId = thread.id;
            await user.save();
        }

        await Thread.create({
            threadId: thread.id,
            userId,
            assistantId: ASSISTANT_ID,
            messages: []
        });

        return thread.id;
    }
}

export default new AssistantService();

