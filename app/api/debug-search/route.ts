import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { getAIProvider } from '@/lib/ai-provider'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug-search?q=your+question
 * Diagnostic endpoint — tests the full knowledge base retrieval pipeline.
 * Use this to find out WHY the chat can't find your uploaded content.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || 'test'
  const provider = getAIProvider()
  const report: Record<string, any> = { query, provider }

  // Step 1: Count chunks in DB
  try {
    const { count, error } = await supabase
      .from('chunks_table')
      .select('*', { count: 'exact', head: true })

    report.totalChunksInDB = error ? `ERROR: ${error.message}` : count
  } catch (e: any) {
    report.totalChunksInDB = `EXCEPTION: ${e.message}`
  }

  // Step 2: Sample a few chunks (no vector needed)
  try {
    const { data, error } = await supabase
      .from('chunks_table')
      .select('id, content, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(3)

    report.sampleChunks = error
      ? `ERROR: ${error.message}`
      : data?.map((c: any) => ({
          id: c.id,
          contentPreview: c.content?.substring(0, 80),
          filename: c.metadata?.filename,
          chunkType: c.metadata?.chunk_type,
          uploadedAt: c.metadata?.uploaded_at,
        }))
  } catch (e: any) {
    report.sampleChunks = `EXCEPTION: ${e.message}`
  }

  // Step 3: Generate embedding for the query
  let embedding: number[] | null = null
  try {
    embedding = await generateEmbedding(query)
    report.embeddingGenerated = true
    report.embeddingDimensions = embedding.length
    report.embeddingFirstValues = embedding.slice(0, 4).map(v => v.toFixed(6))
    report.embeddingAllZeros = embedding.every(v => v === 0)
  } catch (e: any) {
    report.embeddingGenerated = false
    report.embeddingError = e.message
  }

  // Step 4: Run match_chunks at very low threshold
  if (embedding) {
    try {
      const { data, error } = await (supabase as any).rpc('match_chunks', {
        query_embedding: embedding,
        match_threshold: 0.0,
        match_count: 5,
      })

      report.matchChunksResult = error
        ? `ERROR: ${error.message}`
        : {
            count: data?.length ?? 0,
            results: data?.map((c: any) => ({
              id: c.id,
              similarity: c.similarity,
              contentPreview: c.content?.substring(0, 80),
              filename: c.filename ?? c.metadata?.filename,
            })) ?? [],
          }
    } catch (e: any) {
      report.matchChunksResult = `EXCEPTION: ${e.message}`
    }
  }

  // Step 5: Diagnosis
  const totalChunks = typeof report.totalChunksInDB === 'number' ? report.totalChunksInDB : 0
  const matchCount =
    typeof report.matchChunksResult === 'object' && report.matchChunksResult?.count != null
      ? report.matchChunksResult.count
      : null

  if (totalChunks === 0) {
    report.diagnosis = '❌ No data in knowledge base. Upload and train a file first.'
  } else if (!report.embeddingGenerated) {
    report.diagnosis = `❌ Embedding generation failed. Check your ${provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} environment variable.`
  } else if (report.embeddingAllZeros) {
    report.diagnosis = '❌ Embedding returned all zeros — API key may be invalid or provider mismatch.'
  } else if (matchCount === 0) {
    report.diagnosis =
      '⚠️ Data exists but no matches found at threshold 0.0. Likely a provider mismatch: data was trained with one provider (OpenAI/Gemini) but chat is querying with another.'
  } else if (matchCount !== null && matchCount > 0) {
    report.diagnosis = `✅ Knowledge base retrieval is working. Found ${matchCount} matches for this query.`
  } else {
    report.diagnosis = '❓ Could not determine. Check matchChunksResult for details.'
  }

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
