import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import pdf from 'pdf-parse'
import { extractTextFromPDFImages } from '@/lib/ocr'

/**
 * Extract sentences from text — the only storage unit.
 * Each sentence will be stored as its own chunk linked to a trained_files row.
 */
function extractSentences(text: string): string[] {
  const sentences = text
    .replace(/\r\n|\r/g, '\n')
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/\.{3,}/g, '...\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 10)

  return Array.from(new Set(sentences))
}

/**
 * Build a short description from the first few sentences of the file,
 * so the AI knows what the file is about without reading every sentence.
 */
function buildDescription(text: string, maxLength = 300): string {
  const sentences = extractSentences(text)
  let description = ''
  for (const sentence of sentences.slice(0, 5)) {
    if (description.length + sentence.length > maxLength) break
    description += (description ? ' ' : '') + sentence
  }
  return description || text.substring(0, maxLength).trim()
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    const MAX_FILE_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum limit of 50MB` },
        { status: 400 }
      )
    }

    console.log(`[Train] File: "${file.name}", size: ${(file.size / (1024 * 1024)).toFixed(1)}MB`)

    let ocrStats = { imagesProcessed: 0, charactersExtracted: 0, provider: 'none' as string }
    const isManualTraining = file.name === 'manual-training.txt'

    // For manual training, gather existing sentences before wiping the old entry
    let existingManualContent = ''
    if (isManualTraining) {
      console.log('[Train] Checking for existing manual training data...')
      const { data: existingFile } = await (supabase as any)
        .from('trained_files')
        .select('id')
        .eq('filename', file.name)
        .maybeSingle()

      if (existingFile?.id) {
        const { data: existingChunks } = await supabase
          .from('chunks_table')
          .select('content')
          .eq('file_id', existingFile.id)
          .order('metadata->chunk_index' as any, { ascending: true })

        if (existingChunks && existingChunks.length > 0) {
          existingManualContent = existingChunks.map((c: any) => c.content).join('\n')
          console.log(`[Train] Found ${existingChunks.length} existing sentences to carry forward`)
          // Deleting trained_files row cascades to chunks_table via file_id FK
          await (supabase as any).from('trained_files').delete().eq('id', existingFile.id)
        }
      }
    }

    // Upload original file to Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(fileBuffer)
    const timestamp = Date.now()
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storageFilename = `${timestamp}-${sanitizedFilename}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('training-files')
      .upload(storageFilename, buffer, { contentType: file.type, cacheControl: '3600', upsert: true })

    if (uploadError) {
      console.error('[Train] Storage upload error:', uploadError)
    } else {
      console.log('[Train] File uploaded to storage:', uploadData.path)
    }

    // Extract raw text
    let extractedText = ''

    if (file.type === 'application/pdf') {
      console.log('[Train] Extracting text from PDF...')
      const pdfData = await pdf(buffer)
      extractedText = pdfData.text
      console.log(`[Train] Extracted ${extractedText.length} characters from PDF text`)

      console.log('[Train] Starting OCR on PDF images...')
      const ocrResult = await extractTextFromPDFImages(buffer)
      ocrStats = {
        imagesProcessed: ocrResult.imagesProcessed,
        charactersExtracted: ocrResult.charactersExtracted,
        provider: ocrResult.provider,
      }
      if (ocrResult.text?.length > 0) {
        console.log(`[Train] OCR extracted ${ocrResult.charactersExtracted} characters from ${ocrResult.imagesProcessed} images`)
        extractedText += '\n\n' + ocrResult.text
      }
      console.log(`[Train] Total extracted text: ${extractedText.length} characters`)
    } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const newText = await file.text()
      extractedText = isManualTraining && existingManualContent
        ? existingManualContent + '\n' + newText
        : newText
    } else {
      return NextResponse.json(
        { error: 'Only PDF and text files are supported' },
        { status: 400 }
      )
    }

    if (!extractedText?.trim()) {
      return NextResponse.json(
        { error: 'No text could be extracted from the file' },
        { status: 400 }
      )
    }

    // Extract sentences — the only unit we store
    const sentences = extractSentences(extractedText)
    console.log(`[Train] Extracted ${sentences.length} sentences`)

    if (sentences.length === 0) {
      return NextResponse.json(
        { error: 'No sentences could be extracted from the file' },
        { status: 400 }
      )
    }

    // Auto-generate a description so the AI knows what this file contains
    const description = buildDescription(extractedText)
    const uploadedAt = new Date().toISOString()

    // Create the trained_files row first — every sentence will reference it
    const { data: trainedFile, error: fileInsertError } = await (supabase as any)
      .from('trained_files')
      .insert({
        filename: file.name,
        storage_path: uploadData?.path || null,
        file_type: file.type,
        file_size: file.size,
        description,
        uploaded_at: uploadedAt,
      })
      .select('id')
      .single()

    if (fileInsertError || !trainedFile) {
      console.error('[Train] Failed to create trained_files row:', fileInsertError)
      return NextResponse.json({ error: 'Failed to register file in database' }, { status: 500 })
    }

    const fileId = trainedFile.id
    console.log(`[Train] Created trained_files row id=${fileId}`)

    // Process sentences in batches
    const BATCH_SIZE = 50
    const TIMEOUT_THRESHOLD = 50000
    const startTime = Date.now()
    const insertedChunks: any[] = []
    let processedCount = 0

    for (let batchStart = 0; batchStart < sentences.length; batchStart += BATCH_SIZE) {
      if (Date.now() - startTime > TIMEOUT_THRESHOLD) {
        console.log(`[Train] Timeout after ${processedCount}/${sentences.length} sentences`)
        const charsSoFar = insertedChunks.reduce((s, c) => s + (c?.content?.length ?? 0), 0)
        await (supabase as any)
          .from('trained_files')
          .update({ sentence_count: insertedChunks.length, character_count: charsSoFar })
          .eq('id', fileId)

        return NextResponse.json({
          success: true,
          partial: true,
          message: `Processed ${processedCount} of ${sentences.length} sentences (timeout). Re-upload to continue.`,
          sentences: insertedChunks.length,
          filename: file.name,
          processed: processedCount,
          total: sentences.length,
          remaining: sentences.length - processedCount,
        })
      }

      const batchEnd = Math.min(batchStart + BATCH_SIZE, sentences.length)
      const batch = sentences.slice(batchStart, batchEnd)
      console.log(`[Train] Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: sentences ${batchStart + 1}-${batchEnd}`)

      const batchResults = await Promise.all(
        batch.map(async (sentence, idx) => {
          const i = batchStart + idx
          try {
            const embedding = await generateEmbedding(sentence)
            const { data, error } = await supabase
              .from('chunks_table')
              .insert({
                content: sentence,
                embedding,
                file_id: fileId,
                metadata: {
                  filename: file.name,
                  storage_path: uploadData?.path || null,
                  file_type: file.type,
                  file_size: file.size,
                  chunk_index: i,
                  chunk_type: 'sentence',
                  chunk_strategy: 'sentence',
                  total_chunks: sentences.length,
                  characters: sentence.length,
                  uploaded_at: uploadedAt,
                },
              } as any)
              .select('id, content')
              .single()

            if (error) { console.error(`[Train] Error inserting sentence ${i + 1}:`, error); return null }
            return data
          } catch (err) {
            console.error(`[Train] Error processing sentence ${i + 1}:`, err)
            return null
          }
        })
      )

      const successful = batchResults.filter(r => r !== null)
      insertedChunks.push(...successful)
      processedCount += batch.length
      console.log(`[Train] Batch done: ${successful.length}/${batch.length} ok, total ${insertedChunks.length}`)
    }

    // Update sentence_count and character_count on the trained_files row
    const totalCharacters = insertedChunks.reduce((s, c) => s + (c?.content?.length ?? 0), 0)
    await (supabase as any)
      .from('trained_files')
      .update({ sentence_count: insertedChunks.length, character_count: totalCharacters })
      .eq('id', fileId)

    const elapsed = Date.now() - startTime
    console.log(`[Train] Done: ${insertedChunks.length} sentences in ${elapsed}ms`)

    return NextResponse.json({
      success: true,
      message: `Successfully stored ${insertedChunks.length} sentences from "${file.name}"`,
      sentences: insertedChunks.length,
      filename: file.name,
      fileId,
      description,
      processingTime: elapsed,
      ocr: ocrStats,
    })

  } catch (error) {
    console.error('[Train] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 }
    )
  }
}
