import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('Missing OpenAI API key')
}

export const openai = new OpenAI({
  apiKey,
})

/**
 * Generate text embedding using OpenAI's text-embedding-3-small model
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text, 
  })

  return response.data[0].embedding
}

/**
 * Generate a text completion using OpenAI's GPT model
 * This is used as a fallback when no trained data is available
 * @deprecated Use generateWordCompletion or generatePhraseCompletion instead
 */
export async function generateCompletion(userInput: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a professional business writing assistant. Provide autocomplete suggestions using clear, professional language appropriate for business and workplace communication. Keep suggestions concise, formal, and contextually relevant. Use proper business terminology and maintain a professional tone throughout.',
      },
      {
        role: 'user',
        content: `Complete this text in a professional business style: "${userInput}"`,
      },
    ],
    max_tokens: 100,
    temperature: 0.1,
  })

  return response.choices[0]?.message?.content?.trim() || ''
}

/**
 * Complete an incomplete word that user is typing
 * Example: "busine" -> "ss" (not "business")
 */
export async function generateWordCompletion(userInput: string, incompleteWord: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a word completion assistant. Return ONLY the missing characters to complete the word, NOT the full word.

Examples:
- User typed "hel" → Return "lo" (not "hello")
- User typed "busine" → Return "ss" (not "business")
- User typed "수정" → Return "" if complete
- Return ONLY completion characters, NO full words, NO explanations`,
      },
      {
        role: 'user',
        content: `Context: "${userInput}"\nIncomplete word: "${incompleteWord}"\n\nReturn ONLY the missing characters to complete "${incompleteWord}". Do not return the full word.`,
      },
    ],
    max_tokens: 20,
    temperature: 0.1,
  })

  let completion = response.choices[0]?.message?.content?.trim() || ''
  
  // Remove any surrounding quotes that AI might have added
  completion = completion.replace(/^["']|["']$/g, '')
  
  // If AI returned the full word instead of just the completion, extract the completion part
  if (completion.toLowerCase().startsWith(incompleteWord.toLowerCase()) || 
      completion.startsWith(incompleteWord)) {
    return completion.substring(incompleteWord.length)
  }
  
  return completion
}

/**
 * Suggest the next phrase or sentence after a completed word
 * Example: "I would like to " -> "discuss this matter with you"
 */
export async function generatePhraseSuggestion(userInput: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an intelligent predictive text assistant. Predict what the user is most likely to type next.

Rules:
1. PREDICT the most natural continuation based on common patterns
2. Analyze the user's intent and tone
3. Don't respond to questions - predict what they'll say next
4. Don't greet back - predict their next words
5. Return 3-15 words of likely continuation
6. Be context-aware and intelligent
7. Match the language and formality level

Examples:
- "I need help with" → "my project deadline" or "understanding this concept"
- "Can you please" → "send me the details" or "clarify this point"
- "Looking forward to" → "hearing from you" or "our meeting tomorrow"`,
      },
      {
        role: 'user',
        content: `Predict what naturally comes next: "${userInput}"

Return only the predicted continuation (3-15 words).`,
      },
    ],
    max_tokens: 80,
    temperature: 0.4,
  })

  let result = response.choices[0]?.message?.content?.trim() || ''
  
  // Remove any surrounding quotes that AI might have added
  result = result.replace(/^["']|["']$/g, '')
  
  return result
}

/**
 * Generate chat response using OpenAI with optional context from vector database
 */
export async function generateChatResponse(
  userMessage: string,
  context?: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: context
        ? `You are an AI assistant that answers ONLY based on the provided knowledge base. Do NOT use any outside knowledge or make up information.

If the answer is clearly present in the context, answer it accurately and cite which source it came from.
If the context does not contain enough information to answer, respond with: "I don't have information about that in my knowledge base."

Context from knowledge base:
${context}`
        : 'You are an AI assistant that answers ONLY based on a knowledge base. You have no context available for this question, so you must respond: "I don\'t have information about that in my knowledge base."',
    },
  ]

  // Add conversation history if provided
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory.slice(-10)) // Keep last 10 messages for context
  }

  // Add current user message
  messages.push({
    role: 'user',
    content: userMessage,
  })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 500,
    temperature: 0.7,
  })

  let result = response.choices[0]?.message?.content?.trim() || ''
  
  // Remove any surrounding quotes that AI might have added
  result = result.replace(/^["']|["']$/g, '')
  
  return result
}

/**
 * Generate a smart phrase suggestion using AI Agent pattern with RAG
 * This function receives user input and relevant context from vector DB,
 * then uses AI to generate an intelligent, contextualized suggestion
 */
export async function generateSmartPhraseSuggestion(
  userInput: string, 
  retrievedContext: string[]
): Promise<string> {
  const contextText = retrievedContext.length > 0 
    ? retrievedContext.map((chunk, i) => `[Context ${i + 1}]: ${chunk}`).join('\n\n')
    : 'No specific context available.'

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an intelligent predictive text assistant. Your job is to PREDICT and CONTINUE what the user is most likely to type next.

Core Rules:
1. PREDICT what comes next naturally - don't respond conversationally
2. Analyze the context from knowledge base to understand patterns and likely continuations
3. If user types "I want to", predict common actions: "learn more", "discuss this", "schedule a meeting"
4. If user types "How can I", predict based on context: "improve", "solve", "implement"
5. Match the language, tone, and domain from the context
6. Return 3-15 words of the most likely continuation
7. Use knowledge base patterns to make intelligent predictions
8. This is PREDICTIVE AUTOCOMPLETE - anticipate user intent

Examples:
- Context about meetings → predict meeting-related phrases
- Context about technical docs → predict technical terminology
- Context about greetings → predict polite continuations`,
      },
      {
        role: 'user',
        content: `User is typing: "${userInput}"

Knowledge base context (learn patterns from this):
${contextText}

Based on the context patterns, predict the most likely 3-15 words that would naturally continue this text. Return ONLY the prediction, nothing else.`,
      },
    ],
    max_tokens: 80,
    temperature: 0.4,
  })

  let result = response.choices[0]?.message?.content?.trim() || ''
  
  // Remove any surrounding quotes that AI might have added
  result = result.replace(/^["']|["']$/g, '')
  
  return result
}

/**
 * Generate a smart word completion using AI Agent pattern with RAG
 */
export async function generateSmartWordCompletion(
  userInput: string,
  incompleteWord: string,
  retrievedContext: string[]
): Promise<string> {
  const contextText = retrievedContext.length > 0
    ? retrievedContext.map((chunk, i) => `[Context ${i + 1}]: ${chunk}`).join('\n\n')
    : 'No specific context available.'

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a word completion assistant. Return ONLY the missing part to complete the word, NOT the full word.

Rules:
1. User typed: "hel" - You return: "lo" (not "hello")
2. User typed: "수정" - You return: "" if complete, or missing characters if incomplete
3. Return ONLY the completion characters (what comes after the incomplete word)
4. If the word is already complete, return empty
5. Match the language (English, Korean, Chinese, etc.)
6. NO explanations, NO full words, ONLY the completion part`,
      },
      {
        role: 'user',
        content: `Full text: "${userInput}"
Incomplete word to complete: "${incompleteWord}"

Context from knowledge base:
${contextText}

Return ONLY the missing characters to complete "${incompleteWord}". Do not return the full word.`,
      },
    ],
    max_tokens: 20,
    temperature: 0.1,
  })

  let completion = response.choices[0]?.message?.content?.trim() || ''
  
  // Remove any surrounding quotes that AI might have added
  completion = completion.replace(/^["']|["']$/g, '')
  
  // If AI returned the full word instead of just the completion, extract the completion part
  if (completion.toLowerCase().startsWith(incompleteWord.toLowerCase()) || 
      completion.startsWith(incompleteWord)) {
    return completion.substring(incompleteWord.length)
  }
  
  return completion
}
