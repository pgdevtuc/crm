import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { connectDB } from '@/lib/mongodb';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

connectDB().then(() => {
  console.log('✅ Conectado a la base de datos para VectorService');
}).catch((err) => {
  console.error('❌ Error conectando a la base de datos para VectorService:', err);
});

export class VectorService {

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });

    return response.data[0].embedding;
  }

  async searchSimilarDocuments(
    query: string,
    matchCount: number = 5,
    filter?: Record<string, any>
  ): Promise<any[]> {
    try {

      const embedding = await this.generateEmbedding(query);

      const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_count: matchCount,
        filter: filter || {}
      });

      if (error) {
        console.error('Error en búsqueda vectorial:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error al buscar documentos:', error);
      throw error;
    }
  }

  async searchDocuments(query: string, limit: number = 10): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .textSearch('content', query, {
          type: 'websearch',
          config: 'english'
        })
        .limit(limit);

      if (error) {
        console.error('Error buscando documentos:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }

  async getDocumentById(id: string): Promise<any> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async insertDocument(content: string, metadata?: any): Promise<any> {
    const embedding = await this.generateEmbedding(content);

    const { data, error } = await supabase
      .from('documents')
      .insert({
        content,
        embedding,
        metadata
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  formatResults(results: any[]): string {
    if (results.length === 0) {
      return 'No se encontraron documentos relevantes en la base de conocimientos.';
    }

    let formatted = `Se encontraron ${results.length} resultado(s) relevante(s):\n\n`;

    results.forEach((doc, idx) => {
      const similarity = doc.similarity ? `${(doc.similarity * 100).toFixed(1)}%` : 'N/A';
      const metadata = doc.metadata ? JSON.stringify(doc.metadata) : '{}';

      formatted += `[Resultado ${idx + 1}] (Relevancia: ${similarity})\n`;
      formatted += `Contenido: ${doc.content}\n`;
      formatted += `Metadata: ${metadata}\n`;
      formatted += `---\n\n`;
    });

    formatted += `\nINSTRUCCIONES: Analiza estos resultados y proporciona una respuesta natural y coherente al usuario. Prioriza los resultados con mayor relevancia. Si múltiples resultados son relevantes, muestra las mas relevantes`;

    return formatted;
  }
}

export default new VectorService();