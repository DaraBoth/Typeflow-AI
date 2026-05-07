import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { generateChatResponse } from '@/lib/openai'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  message: string
  conversationHistory?: Message[]
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json()
    const { message, conversationHistory = [] } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Invalid message provided' },
        { status: 400 }
      )
    }

    let context = ''
    let usedKnowledgeBase = false
    let matches: any[] = []

    // Generate embedding for the user's message
    const embedding = await generateEmbedding(message)

    // Query vector database for relevant context
    const { data, error } = await supabase.rpc('match_chunks' as any, {
      query_embedding: embedding,
      match_threshold: 0.1,
      match_count: 8,
    } as any)

    if (error) {
      console.error('Error searching knowledge base:', error)
      return NextResponse.json(
        { error: 'Failed to search knowledge base', detail: error.message },
        { status: 500 }
      )
    }

    if (data) {
      const chunks = data as any[]
      if (chunks.length > 0) {
        usedKnowledgeBase = true
        matches = chunks

        // Build context with file source metadata so the AI knows where each sentence came from
        context = chunks
          .map((chunk: any, index: number) => {
            // Support both new match_chunks (direct columns) and old (metadata JSONB fallback)
            const filename = chunk.filename || chunk.metadata?.filename || 'unknown'
            const rawDate = chunk.uploaded_at || chunk.metadata?.uploaded_at
            const uploadedDate = rawDate ? new Date(rawDate).toLocaleDateString() : 'unknown date'
            const description = chunk.file_description || chunk.metadata?.file_description || ''
            const sourceLine = `[Source: ${filename} | Uploaded: ${uploadedDate}${description ? ` | About: ${description}` : ''}]`
            return `[${index + 1}] ${sourceLine}\n${chunk.content}`
          })
          .join('\n\n')
      }
    }

    // If no knowledge base context found, return a direct "no knowledge" response
    if (!usedKnowledgeBase) {
      return NextResponse.json({
        response: "I don't have information about that in my knowledge base.",
        usedKnowledgeBase: false,
        contextChunks: 0,
        matches: [],
      })
    }

    // Generate AI response strictly from knowledge base context
    const aiResponse = await generateChatResponse(
      message,
      context,
      conversationHistory
    )

    return NextResponse.json({
      response: aiResponse,
      usedKnowledgeBase,
      contextChunks: matches.length,
      matches: matches.slice(0, 3).map((m: any) => ({
        content: m.content.substring(0, 150) + '...',
        similarity: m.similarity,
      })),
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
