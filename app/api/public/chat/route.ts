import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/auth-middleware'
import { generateChatResponse } from '@/lib/openai'
import { generateEmbedding } from '@/lib/openai'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/public/chat
 * Public API endpoint for AI chat with API key authentication
 * 
 * Headers:
 * - Authorization: Bearer YOUR_API_KEY (required)
 * 
 * Body:
 * - message: string (required) - The user's message
 * - conversationHistory: array (optional) - Previous messages for context
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Authenticate the request
  const auth = await authenticateApiKey(request, 'chat')
  
  if (!auth.authenticated) {
    return auth.response!
  }

  try {
    const body = await request.json()
    const { message, conversationHistory = [] } = body

    // Validate input
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { 
          error: 'Bad Request',
          message: '"message" is required and must be a string',
          example: {
            message: "What is machine learning?",
            conversationHistory: [
              { role: "user", content: "Hello" },
              { role: "assistant", content: "Hi! How can I help you?" }
            ]
          }
        },
        { status: 400 }
      )
    }

    // Generate embedding for the message
    const embedding = await generateEmbedding(message)

    // Search for relevant context
    const { data: chunks, error }:{data: any, error: any} = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: 5,
    } as any)

    if (error) {
      console.error('Error searching knowledge base:', error)
    }

    // Build context from retrieved chunks
    const context = chunks && chunks.length > 0
      ? chunks.map((chunk: any) => chunk.content).join('\n\n')
      : null

    // If no knowledge base context found, return a direct "no knowledge" response
    if (!context) {
      return NextResponse.json(
        {
          success: true,
          response: "I don't have information about that in my knowledge base.",
          metadata: {
            contextUsed: false,
            chunksRetrieved: 0,
            responseTime: `${Date.now() - startTime}ms`,
            apiVersion: '1.0'
          }
        }
      )
    }

    // Generate chat response strictly from knowledge base context
    const response = await generateChatResponse(message, conversationHistory, context)

    const responseTime = Date.now() - startTime

    return NextResponse.json(
      {
        success: true,
        response: response,
        metadata: {
          contextUsed: !!context,
          chunksRetrieved: chunks?.length || 0,
          responseTime: `${responseTime}ms`,
          apiVersion: '1.0'
        }
      },
      {
        headers: {
          'X-Response-Time': `${responseTime}ms`,
          'X-API-Version': '1.0',
          'X-Context-Used': context ? 'true' : 'false'
        }
      }
    )

  } catch (error) {
    console.error('Error in public chat endpoint:', error)
    return NextResponse.json(
      { 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  }
}
