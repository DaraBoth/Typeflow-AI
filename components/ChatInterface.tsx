'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Send, Bot, User, Database, Sparkles, Loader2, Trash2, ArrowUp } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { sendChatMessage, type ChatMessage } from '@/services'
import { BorderBeam } from '@/components/ui/border-beam'
import { Particles } from '@/components/ui/particles'
import { DotPattern } from '@/components/ui/dot-pattern'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import Image from 'next/image'
import ShimmerButton from './ui/shimmer-button'

interface Message {
  role: 'user' | 'assistant'
  content: string
  usedKnowledgeBase?: boolean
  contextChunks?: number
}

export default function ChatInterface() {
  // Get state and actions from store
  const messages = useAppStore((state) => state.chatMessages)
  const setMessages = useAppStore((state) => state.setChatMessages)
  const addMessage = useAppStore((state) => state.addChatMessage)
  const inputValue = useAppStore((state) => state.chatInput)
  const setInputValue = useAppStore((state) => state.setChatInput)
  const clearChat = useAppStore((state) => state.clearChat)

  // Local UI state
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const botIconRef = useRef<HTMLDivElement>(null)
  const kbIconRef = useRef<HTMLDivElement>(null)

  // State for knowledge beam pulse
  const [showBeam, setShowBeam] = useState(false)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = inputValue.trim()
    setInputValue('')

    // Add user message to chat
    const newUserMessage: Message = {
      role: 'user',
      content: userMessage,
    }
    addMessage(newUserMessage)

    setIsLoading(true)

    try {
      const data = await sendChatMessage(
        userMessage,
        messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))
      )

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        usedKnowledgeBase: (data as any).usedKnowledgeBase,
        contextChunks: (data as any).contextChunks,
      }
      addMessage(assistantMessage)

      // Pulse knowledge beam if KB was used
      if ((data as any).usedKnowledgeBase) {
        setShowBeam(true)
        setTimeout(() => setShowBeam(false), 2000)
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I could not connect to the AI service.',
      }
      addMessage(errorMessage)
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClearChat = () => {
    clearChat()
  }

  return (
    <div className="space-y-4 sm:space-y-6 relative" ref={containerRef}>
      <Card className="border-white/10 bg-black/40 backdrop-blur-xl relative overflow-hidden group">
        <BorderBeam size={250} duration={12} delay={9} />

        <CardContent className="p-4 sm:p-6 relative z-10">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
                <Bot className="h-6 w-6 text-primary relative z-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  AI Chat Assistant
                  <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                </h3>
                <p className="text-xs sm:text-sm text-white/50">
                  Ask questions and get answers powered by your knowledge base
                </p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button
                onClick={handleClearChat}
                variant="ghost"
                size="sm"
                className="h-9 px-3 text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-all border border-white/5"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Chat
              </Button>
            )}
          </div>

          {/* Messages Container */}
          <div className="mb-4 flex min-h-[400px] sm:min-h-[500px] max-h-[600px] flex-col overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-4 sm:p-6 relative group/container">
            <DotPattern
              width={20}
              height={20}
              cx={1}
              cy={1}
              cr={1}
              className="opacity-10 [mask-image:radial-gradient(white,transparent_110%)]"
            />
            <Particles
              className="absolute inset-0 z-0 transition-opacity duration-1000 group-hover/container:opacity-50 opacity-20"
              quantity={30}
              staticity={50}
            />

            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-center px-2 relative z-10">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="relative mx-auto h-20 w-20 sm:h-24 sm:w-24 flex items-center justify-center rounded-3xl bg-primary/10 border border-primary/20 shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-transparent" />
                    <Bot className="h-10 w-10 sm:h-12 sm:w-12 text-primary relative z-10" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-2xl font-bold text-white tracking-tight">
                      How can I help you today?
                    </h4>
                    <p className="mx-auto max-w-sm text-sm text-white/50 leading-relaxed">
                      I'm your intelligent assistant. I can use your uploaded documents to provide high-precision answers.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-w-sm mx-auto">
                    {[
                      "What knowledge do you have?",
                      "Summarize my uploaded documents",
                      "Explain the core features"
                    ].map((tip, i) => (
                      <button
                        key={i}
                        onClick={() => setInputValue(tip)}
                        className="text-left px-4 py-2.5 rounded-xl border border-white/5 bg-white/5 text-sm text-white/60 hover:bg-white/10 hover:text-white transition-all"
                      >
                        <span className="text-primary mr-2">✦</span>
                        {tip}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="space-y-6 relative z-10">
                <AnimatePresence initial={false}>
                  {messages.map((message, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className={`flex gap-3 sm:gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                    >
                      {message.role === 'assistant' && (
                        <div
                          ref={botIconRef}
                          className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 relative overflow-hidden"
                        >
                          <Image src="/icon.png" alt="Bot" width={32} height={32} className="relative z-30 h-full w-full object-cover" />
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-lg relative ${message.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-none border border-blue-500'
                          : 'bg-white/5 text-white/90 border border-white/10 rounded-tl-none backdrop-blur-md'
                          }`}
                      >
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {message.content}
                        </p>

                        {message.role === 'assistant' && (
                          <div className="mt-3 flex items-center gap-3">
                            {message.usedKnowledgeBase ? (
                              <div
                                ref={kbIconRef}
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] sm:text-xs text-emerald-400 font-medium"
                              >
                                <Database className="h-3 w-3" />
                                <span>Used knowledge base ({message.contextChunks} sources)</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] sm:text-xs text-blue-400 font-medium">
                                <Sparkles className="h-3 w-3" />
                                <span>General knowledge</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {message.role === 'user' && (
                        <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/20">
                          <User className="h-5 w-5 sm:h-6 sm:w-6 text-white/70" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3 sm:gap-4 justify-start"
                  >
                    <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 animate-pulse">
                      <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    <div className="rounded-2xl bg-white/5 px-4 py-3 border border-white/10 backdrop-blur-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <motion.div
                            animate={{ scale: [1, 1.5, 1] }}
                            transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                            className="h-1.5 w-1.5 rounded-full bg-primary/60"
                          />
                          <motion.div
                            animate={{ scale: [1, 1.5, 1] }}
                            transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                            className="h-1.5 w-1.5 rounded-full bg-primary/60"
                          />
                          <motion.div
                            animate={{ scale: [1, 1.5, 1] }}
                            transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                            className="h-1.5 w-1.5 rounded-full bg-primary/60"
                          />
                        </div>
                        <span className="text-xs font-medium text-white/50 tracking-wide uppercase">AI Thinking</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Knowledge Pulse Beam */}
                {showBeam && (
                  <AnimatedBeam
                    containerRef={containerRef}
                    fromRef={kbIconRef}
                    toRef={botIconRef}
                    curvature={20}
                    duration={1.5}
                    pathColor="#10b981"
                    gradientStartColor="#10b981"
                    gradientStopColor="#3b82f6"
                  />
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="flex gap-2 relative z-10">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message AI assistant..."
                className="w-full flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/20 focus:border-primary/50 focus:bg-white/10 focus:outline-none transition-all duration-300"
                rows={2}
                disabled={isLoading}
              />
              <div className="absolute inset-0 rounded-xl pointer-events-none border border-transparent group-focus-within:border-primary/30 transition-all duration-500" />
            </div>

            <ShimmerButton
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="h-[68px] sm:h-[72px] w-14 sm:w-16 rounded-xl flex items-center justify-center p-0"
              shimmerSize="0.1em"
              shimmerColor="rgba(59, 130, 246, 0.4)"
              borderRadius="12px"
            >
              {isLoading ? (
                <Loader2 className="h-7 w-7 animate-spin text-white" />
              ) : (
                <ArrowUp className="h-7 w-7 text-white" />
              )}
            </ShimmerButton>
          </div>

          {/* Help Text */}
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Tip: Ask questions about your uploaded documents. The AI answers only from your knowledge base.</span>
            <span className="sm:hidden">Ask questions about your uploaded documents</span>
          </p>
        </CardContent>
      </Card>
    </div >
  )
}
