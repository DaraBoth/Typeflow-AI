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

    try {
      // Generate embedding for the user's message
      const embedding = await generateEmbedding(message)

      // Query vector database for relevant context
      const { data, error } = await supabase.rpc('match_chunks' as any, {
        query_embedding: embedding,
        match_threshold: 0.3, // Lower threshold for more matches
        match_count: 5,
      } as any)

      if (!error && data) {
        const chunks = data as any[]
        if (chunks.length > 0) {
          usedKnowledgeBase = true
          matches = chunks

          // Build context with file source metadata so the AI knows where each sentence came from
          context = chunks
            .map((chunk: any, index: number) => {
              const uploadedDate = chunk.uploaded_at
                ? new Date(chunk.uploaded_at).toLocaleDateString()
                : 'unknown date'
              const sourceLine = `[Source: ${chunk.filename || 'unknown'} | Uploaded: ${uploadedDate}${chunk.file_description ? ` | About: ${chunk.file_description}` : ''}]`
              return `[${index + 1}] ${sourceLine}\n${chunk.content}`
            })
            .join('\n\n')
        }
      }
    } catch (embeddingError) {
      console.error('Error searching knowledge base:', embeddingError)
      // Continue without context if embedding fails
    }

    // Generate AI response with context
    const aiResponse = await generateChatResponse(
      message,
      context || undefined,
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
