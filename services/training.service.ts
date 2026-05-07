/**
 * Training Service
 * Handles AI training, file management, and statistics
 */

export interface TrainingStats {
  totalChunks: number
  totalFiles: number
  totalCharacters: number
  files: Array<{
    filename: string
    chunks: number
  }>
  lastTrainingDate: string | null
  lastTrainingFile: string | null
}

export interface FileInfo {
  name: string
  size: number
  created_at: string
  id?: string
}

/**
 * Train AI with a file (PDF or text)
 */
export async function trainWithFile(
  file: File, 
  chunkType: 'word' | 'sentence' | 'smart' = 'smart'
): Promise<any> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('chunkType', chunkType)

  const response = await fetch('/api/train', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Training failed: ${error}`)
  }

  return response.json()
}

/**
 * Train AI with text content (manual training)
 */
export async function trainWithText(text: string, filename: string = 'manual-training.txt'): Promise<any> {
  const textBlob = new Blob([text], { type: 'text/plain' })
  const file = new File([textBlob], filename, { type: 'text/plain' })
  
  return trainWithFile(file)
}

/**
 * Delete a file from training data
 */
export async function deleteTrainingFile(filename: string): Promise<void> {
  const response = await fetch('/api/forget', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename }),
  })

  if (!response.ok) {
    throw new Error('Failed to delete file')
  }
}

/**
 * Verify admin password
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const response = await fetch('/api/verify-admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  })

  if (!response.ok) {
    return false
  }

  const data = await response.json()
  return data.success === true
}

/**
 * Get training statistics
 */
export async function getTrainingStats(): Promise<TrainingStats> {
  const timestamp = new Date().getTime()
  const response = await fetch(`/api/training-stats?t=${timestamp}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch training stats')
  }

  return response.json()
}

/**
 * Train AI from a Google Docs URL
 */
export async function trainWithGoogleDocsUrl(url: string): Promise<any> {
  const response = await fetch('/api/train-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || 'Failed to import Google Doc')
  }

  return response.json()
}

/**
 * View file content
 */
export async function viewFileContent(filename: string): Promise<{ content: string }> {
  const response = await fetch(`/api/view-file?filename=${encodeURIComponent(filename)}`, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error('Failed to view file')
  }

  return response.json()
}

/**
 * Download file
 */
export async function downloadFile(filename: string): Promise<Blob> {
  const response = await fetch('/api/download-file', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename }),
  })

  if (!response.ok) {
    throw new Error('Failed to download file')
  }

  return response.blob()
}

/**
 * Helper to trigger file download in browser
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}
