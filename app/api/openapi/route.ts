import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://typeflow-ai.vercel.app'

export const dynamic = 'force-static'

export async function GET(_request: NextRequest) {
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'TypeFlow AI API',
      version: '1.0.0',
      description:
        'TypeFlow AI provides intelligent word completion, phrase suggestion, and knowledge-base-grounded chat. All public endpoints require an API key obtained from POST /api/keys/generate.',
      contact: {
        url: `${BASE_URL}/docs`,
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [{ url: BASE_URL, description: 'Production' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key (tk_live_...)',
          description: 'Obtain a key via POST /api/keys/generate',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Unauthorized' },
            message: { type: 'string', example: 'Invalid or missing API key' },
          },
        },
        Suggestion: {
          type: 'object',
          properties: {
            text: { type: 'string', example: 'application' },
            type: { type: 'string', enum: ['word', 'phrase', 'sentence'], example: 'word' },
          },
        },
        ConversationMessage: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string' },
          },
        },
        ResponseMetadata: {
          type: 'object',
          properties: {
            responseTime: { type: 'string', example: '245ms' },
            apiVersion: { type: 'string', example: '1.0' },
          },
        },
      },
    },
    paths: {
      '/api/keys/generate': {
        post: {
          summary: 'Generate an API key',
          description:
            'Creates a new API key. No authentication required. Save the returned key immediately — it is only shown once.',
          operationId: 'generateApiKey',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: {
                      type: 'string',
                      minLength: 3,
                      example: 'My Application',
                      description: 'Human-readable label for this key',
                    },
                    rateLimit: {
                      type: 'integer',
                      default: 1000,
                      example: 1000,
                      description: 'Maximum requests per hour',
                    },
                    allowedEndpoints: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: ['complete-word', 'suggest-phrase', 'chat'],
                      },
                      default: ['complete-word', 'suggest-phrase', 'chat'],
                      description: 'Endpoints this key is permitted to call',
                    },
                    expiresInDays: {
                      type: 'integer',
                      nullable: true,
                      example: 365,
                      description: 'Key TTL in days. Omit for no expiry.',
                    },
                    metadata: {
                      type: 'object',
                      additionalProperties: true,
                      example: { email: 'user@example.com', company: 'Acme' },
                      description: 'Optional free-form metadata',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'API key created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      apiKey: {
                        type: 'string',
                        example: 'tk_live_XyZ123AbC456...',
                        description: 'Full key — only shown once',
                      },
                      keyInfo: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          keyPrefix: { type: 'string', example: 'tk_live_XyZ' },
                          rateLimit: { type: 'integer' },
                          allowedEndpoints: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                          expiresAt: {
                            type: 'string',
                            format: 'date-time',
                            nullable: true,
                          },
                          createdAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid request body', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/public/complete-word': {
        post: {
          summary: 'Complete an incomplete word',
          description:
            'Returns word completion suggestions based on the current text context and the partially typed word, using the vector knowledge base.',
          operationId: 'completeWord',
          tags: ['Autocomplete'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text', 'incompleteWord'],
                  properties: {
                    text: {
                      type: 'string',
                      example: 'I love to eat',
                      description: 'Full text context typed so far',
                    },
                    incompleteWord: {
                      type: 'string',
                      example: 'app',
                      description: 'The partial word currently being typed',
                    },
                    limit: {
                      type: 'integer',
                      default: 5,
                      maximum: 10,
                      example: 5,
                      description: 'Maximum number of suggestions to return',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Suggestions returned',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      suggestions: {
                        type: 'array',
                        items: { '$ref': '#/components/schemas/Suggestion' },
                      },
                      count: { type: 'integer', example: 3 },
                      metadata: { '$ref': '#/components/schemas/ResponseMetadata' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Missing required fields', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
            '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/public/suggest-phrase': {
        post: {
          summary: 'Suggest a phrase continuation',
          description:
            'Returns phrase suggestions to continue the user\'s text, retrieved from the sentence-level knowledge base.',
          operationId: 'suggestPhrase',
          tags: ['Autocomplete'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text'],
                  properties: {
                    text: {
                      type: 'string',
                      example: 'Machine learning is ',
                      description: 'The text written so far',
                    },
                    limit: {
                      type: 'integer',
                      default: 5,
                      maximum: 10,
                      example: 5,
                      description: 'Maximum number of suggestions to return',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Phrase suggestions returned',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      suggestions: {
                        type: 'array',
                        items: { '$ref': '#/components/schemas/Suggestion' },
                      },
                      count: { type: 'integer', example: 3 },
                      metadata: { '$ref': '#/components/schemas/ResponseMetadata' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Missing required fields', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
            '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/public/chat': {
        post: {
          summary: 'Chat with the AI knowledge base',
          description:
            'Send a message and receive an AI-generated response grounded in the trained sentence knowledge base. Each retrieved sentence includes its source filename, upload date, and document description.',
          operationId: 'chat',
          tags: ['Chat'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: {
                      type: 'string',
                      example: 'What is machine learning?',
                      description: 'The user\'s message',
                    },
                    conversationHistory: {
                      type: 'array',
                      items: { '$ref': '#/components/schemas/ConversationMessage' },
                      description: 'Previous conversation turns for multi-turn context',
                      example: [
                        { role: 'user', content: 'Hello' },
                        { role: 'assistant', content: 'Hi! How can I help you?' },
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'AI response generated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      response: {
                        type: 'string',
                        example: 'Machine learning is a subset of artificial intelligence...',
                      },
                      metadata: {
                        type: 'object',
                        properties: {
                          contextUsed: { type: 'boolean', example: true },
                          chunksRetrieved: { type: 'integer', example: 3 },
                          responseTime: { type: 'string', example: '1245ms' },
                          apiVersion: { type: 'string', example: '1.0' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Missing required fields', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
            '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          },
        },
      },
    },
    tags: [
      { name: 'Authentication', description: 'API key management' },
      { name: 'Autocomplete', description: 'Word and phrase completion from the knowledge base' },
      { name: 'Chat', description: 'Conversational AI grounded in the knowledge base' },
    ],
    externalDocs: {
      description: 'Interactive documentation',
      url: `${BASE_URL}/docs`,
    },
  }

  return NextResponse.json(spec, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' },
  })
}
