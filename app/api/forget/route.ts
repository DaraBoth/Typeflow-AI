import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * DELETE endpoint to remove trained data by filename
 * This allows users to "forget" specific training files
 */
export async function DELETE(request: NextRequest) {
  try {
    const { filename } = await request.json()

    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      )
    }

    console.log(`[Forget] Attempting to delete file: ${filename}`)

    // Fetch the trained_files row so we have the storage_path
    const { data: trainedFileRaw, error: fetchError } = await supabase
      .from('trained_files')
      .select('id, storage_path')
      .eq('filename', filename)
      .maybeSingle()

    if (fetchError) {
      console.error('[Forget] Error fetching trained_files row:', fetchError)
    }

    const trainedFile = trainedFileRaw as { id: string; storage_path: string | null } | null
    const storagePath = trainedFile?.storage_path || null

    // Delete from trained_files — ON DELETE CASCADE removes all sentences in chunks_table
    const { data, error } = await supabase
      .from('trained_files')
      .delete()
      .eq('filename', filename)
      .select()

    if (error) {
      console.error('[Forget] Error deleting trained_files row:', error)
      return NextResponse.json(
        { error: 'Failed to delete file: ' + error.message },
        { status: 500 }
      )
    }

    const deletedFiles = data?.length || 0
    console.log(`[Forget] Deleted trained_files row for: ${filename} (cascaded sentences removed)`)

    // Delete the original file from storage if it exists (with timeout protection)
    let storageDeleted = false
    if (storagePath) {
      console.log(`[Forget] Deleting original file from storage: ${storagePath}`)
      
      try {
        // Add a timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Storage deletion timeout')), 8000)
        )
        
        const deletePromise = supabase.storage
          .from('training-files')
          .remove([storagePath])
        
        const { error: storageError } = await Promise.race([
          deletePromise,
          timeoutPromise
        ]) as any

        if (storageError) {
          console.error('[Forget] Error deleting file from storage:', storageError)
        } else {
          console.log(`[Forget] Successfully deleted file from storage`)
          storageDeleted = true
        }
      } catch (timeoutError) {
        console.error('[Forget] Storage deletion timed out:', timeoutError)
        // Continue anyway - chunks are already deleted which is the most important part
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted "${filename}" and all its sentences${storagePath && !storageDeleted ? ' (storage file deletion may have failed)' : ''}`,
      deletedFiles,
      filename,
      storageDeleted,
    })
  } catch (error) {
    console.error('[Forget] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete training data' },
      { status: 500 }
    )
  }
}
