import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'

/**
 * Extract the Google Docs document ID from various link formats:
 *  - https://docs.google.com/document/d/<ID>/edit
 *  - https://docs.google.com/document/d/<ID>/edit?tab=t.0
 *  - https://docs.google.com/document/d/<ID>/pub
 *  - https://drive.google.com/file/d/<ID>/view
 */
function extractGoogleDocId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/i)
  return match ? match[1] : null
}

/**
 * Fetch the plain-text content of a Google Doc via the export URL.
 * The document must be shared as "Anyone with the link can view".
 */
async function fetchGoogleDocContent(docId: string): Promise<{ title: string; text: string }> {
  // Fetch HTML export to extract the document title
  const htmlUrl = `https://docs.google.com/document/d/${docId}/export?format=html`
  const txtUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`

  const [htmlRes, txtRes] = await Promise.all([
    fetch(htmlUrl, { redirect: 'follow' }),
    fetch(txtUrl, { redirect: 'follow' }),
  ])

  if (!txtRes.ok) {
    if (txtRes.status === 403 || txtRes.status === 401) {
      throw new Error(
        'Access denied. Make sure the Google Doc is shared as "Anyone with the link can view".'
      )
    }
    throw new Error(`Failed to fetch Google Doc (status ${txtRes.status})`)
  }

  const text = await txtRes.text()

  // Try to extract title from HTML
  let title = `google-doc-${docId}`
  if (htmlRes.ok) {
    const html = await htmlRes.text()
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) {
      // Google appends " - Google Docs" to the title
      title = titleMatch[1].replace(/\s*-\s*Google Docs\s*$/i, '').trim()
    }
  }

  // Sanitise title for use as a filename
  const safeTitle = title.replace(/[^a-zA-Z0-9.\-_ ]/g, '_').replace(/\s+/g, '_')
  const filename = safeTitle.endsWith('.gdoc') ? safeTitle : `${safeTitle}.gdoc`

  return { title: filename, text }
}

/**
 * Extract sentences from text — the only storage unit.
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
 * Build a short description from the first few sentences.
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
    const body = await request.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'A Google Docs URL is required' }, { status: 400 })
    }

    const docId = extractGoogleDocId(url)
    if (!docId) {
      return NextResponse.json(
        { error: 'Could not extract a document ID from the provided URL. Make sure it is a valid Google Docs link.' },
        { status: 400 }
      )
    }

    console.log(`[TrainURL] Fetching Google Doc id=${docId}`)

    let docTitle: string
    let extractedText: string
    try {
      const result = await fetchGoogleDocContent(docId)
      docTitle = result.title
      extractedText = result.text
    } catch (fetchErr: any) {
      return NextResponse.json({ error: fetchErr.message }, { status: 422 })
    }

    if (!extractedText?.trim()) {
      return NextResponse.json({ error: 'The Google Doc appears to be empty.' }, { status: 400 })
    }

    console.log(`[TrainURL] Fetched "${docTitle}": ${extractedText.length} characters`)

    // If a trained_files row already exists for this doc, delete it (and its sentences via cascade)
    // so the user can re-sync the latest version
    const { data: existingFile } = await supabase
      .from('trained_files')
      .select('id')
      .eq('filename', docTitle)
      .maybeSingle()

    if (existingFile) {
      console.log(`[TrainURL] Re-syncing existing file "${docTitle}", removing old sentences`)
      await supabase.from('trained_files').delete().eq('id', (existingFile as any).id)
    }

    const sentences = extractSentences(extractedText)
    console.log(`[TrainURL] Extracted ${sentences.length} sentences`)

    if (sentences.length === 0) {
      return NextResponse.json({ error: 'No sentences could be extracted from the document.' }, { status: 400 })
    }

    const description = buildDescription(extractedText)
    const uploadedAt = new Date().toISOString()

    // Create trained_files row
    const { data: trainedFile, error: fileInsertError } = await supabase
      .from('trained_files')
      .insert({
        filename: docTitle,
        storage_path: null, // no storage upload for URL-based docs
        file_type: 'application/vnd.google-apps.document',
        file_size: extractedText.length,
        description,
        uploaded_at: uploadedAt,
      })
      .select('id')
      .single()

    if (fileInsertError || !trainedFile) {
      console.error('[TrainURL] Failed to create trained_files row:', fileInsertError)
      return NextResponse.json({ error: 'Failed to register document in database' }, { status: 500 })
    }

    const fileId = (trainedFile as any).id

    // Insert sentences in batches
    const BATCH_SIZE = 50
    const TIMEOUT_THRESHOLD = 50000
    const startTime = Date.now()
    const inserted: any[] = []
    let processedCount = 0

    for (let batchStart = 0; batchStart < sentences.length; batchStart += BATCH_SIZE) {
      if (Date.now() - startTime > TIMEOUT_THRESHOLD) {
        const charsSoFar = inserted.reduce((s, c) => s + (c?.content?.length ?? 0), 0)
        await supabase
          .from('trained_files')
          .update({ sentence_count: inserted.length, character_count: charsSoFar })
          .eq('id', fileId)

        return NextResponse.json({
          success: true,
          partial: true,
          message: `Processed ${processedCount} of ${sentences.length} sentences (timeout). Re-submit the link to continue.`,
          sentences: inserted.length,
          filename: docTitle,
          processed: processedCount,
          total: sentences.length,
        })
      }

      const batchEnd = Math.min(batchStart + BATCH_SIZE, sentences.length)
      const batch = sentences.slice(batchStart, batchEnd)

      const results = await Promise.all(
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
                  filename: docTitle,
                  storage_path: null,
                  file_type: 'application/vnd.google-apps.document',
                  file_size: extractedText.length,
                  chunk_index: i,
                  chunk_type: 'sentence',
                  chunk_strategy: 'sentence',
                  total_chunks: sentences.length,
                  characters: sentence.length,
                  uploaded_at: uploadedAt,
                  source_url: url,
                  google_doc_id: docId,
                },
              } as any)
              .select('id, content')
              .single()

            if (error) { console.error(`[TrainURL] Sentence ${i + 1} error:`, error); return null }
            return data
          } catch (err) {
            console.error(`[TrainURL] Sentence ${i + 1} exception:`, err)
            return null
          }
        })
      )

      const successful = results.filter(r => r !== null)
      inserted.push(...successful)
      processedCount += batch.length
    }

    const totalCharacters = inserted.reduce((s, c) => s + (c?.content?.length ?? 0), 0)
    await supabase
      .from('trained_files')
      .update({ sentence_count: inserted.length, character_count: totalCharacters })
      .eq('id', fileId)

    const elapsed = Date.now() - startTime
    console.log(`[TrainURL] Done: ${inserted.length} sentences in ${elapsed}ms`)

    return NextResponse.json({
      success: true,
      message: `Successfully stored ${inserted.length} sentences from "${docTitle}"`,
      sentences: inserted.length,
      filename: docTitle,
      fileId,
      description,
      processingTime: elapsed,
      isUpdate: !!existingFile,
    })
  } catch (error) {
    console.error('[TrainURL] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to process Google Doc URL' }, { status: 500 })
  }
}
