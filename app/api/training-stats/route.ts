import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    // Get total sentence count from chunks_table
    const { count: totalChunks, error: countError } = await supabase
      .from('chunks_table')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Error counting sentences:', countError)
      return NextResponse.json(
        { error: 'Failed to fetch statistics' },
        { status: 500 }
      )
    }

    // Get per-file stats from trained_files via RPC
    const { data: fileStats, error: rpcError } = await supabase
      .rpc('get_trained_files_stats')

    if (rpcError) {
      console.error('Error fetching file stats RPC:', rpcError)
      return NextResponse.json(
        { error: 'Failed to fetch file statistics' },
        { status: 500 }
      )
    }

    interface TrainedFileStat {
      filename: string
      sentence_count: string | number
      character_count: string | number
      uploaded_at: string
      description: string | null
      file_id: string
    }

    const stats = (fileStats as unknown as TrainedFileStat[]) || []

    const totalCharacters = stats.reduce((s, f) => s + Number(f.character_count), 0)
    const fileNames = stats.map(f => f.filename)
    const mostRecent = stats[0] ?? null // already ordered by uploaded_at DESC

    return NextResponse.json({
      totalChunks: totalChunks || 0,
      totalFiles: stats.length,
      totalCharacters,
      files: fileNames,
      fileDetails: stats.map(f => ({
        filename: f.filename,
        sentenceCount: Number(f.sentence_count),
        characterCount: Number(f.character_count),
        uploadedAt: f.uploaded_at,
        description: f.description,
        fileId: f.file_id,
      })),
      lastTrainingDate: mostRecent?.uploaded_at ?? null,
      lastTrainingFile: mostRecent?.filename ?? null,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (error) {
    console.error('Training stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch training statistics' },
      { status: 500 }
    )
  }
}
