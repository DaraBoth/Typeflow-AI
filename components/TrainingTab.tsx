'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileText, CheckCircle2, XCircle, Loader2, Database, FileStack, Calendar, BarChart3, Trash2, AlertTriangle, Eye, Download, BrainCircuit, File as FileIcon, Link, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import ShimmerButton from '@/components/ui/shimmer-button'
import NumberTicker from '@/components/ui/number-ticker'
import { BorderBeam } from '@/components/ui/border-beam'
import Sparkles from '@/components/ui/sparkles'
import { Button } from '@/components/ui/button'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { Meteors } from '@/components/ui/meteors'
import { Particles } from '@/components/ui/particles'
import { Confetti } from '@/components/ui/confetti'
import { useRef } from 'react'
import Image from 'next/image'
import { AIProviderBadge } from '@/components/AIProviderBadge'
import { OCRProviderBadge } from '@/components/OCRProviderBadge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { trainWithFile, trainWithGoogleDocsUrl, getTrainingStats, deleteTrainingFile, viewFileContent, downloadFile, triggerFileDownload, verifyAdminPassword, type TrainingStats as ITrainingStats } from '@/services'

interface UploadStatus {
  status: 'idle' | 'uploading' | 'success' | 'error'
  message: string
  filename?: string
  chunks?: number
}

interface TrainedFile {
  filename: string
  chunkCount: number
  lastUpdated: string
}

interface ActiveFile {
  id: string
  name: string
  status: 'pending' | 'processing' | 'completed' | 'error'
}

export default function TrainingTab() {
  const uploadStatus = useAppStore((state) => state.trainingUploadStatus)
  const setUploadStatus = useAppStore((state) => state.setTrainingUploadStatus)
  const [stats, setStats] = useState<ITrainingStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [trainedFiles, setTrainedFiles] = useState<TrainedFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)
  const [viewingFile, setViewingFile] = useState<{ filename: string; content: string; metadata: any } | null>(null)
  const [loadingView, setLoadingView] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [chunkStrategy, setChunkStrategy] = useState<'word' | 'sentence' | 'smart'>('smart')
  const [activeFiles, setActiveFiles] = useState<ActiveFile[]>([])
  const [googleDocsUrl, setGoogleDocsUrl] = useState('')
  const [importingUrl, setImportingUrl] = useState(false)

  // Refs for Animated Beam (Upload)
  const containerRef = useRef<HTMLDivElement>(null)
  const brainRef = useRef<HTMLDivElement>(null)
  const fileRefs = useRef<{ [key: string]: React.RefObject<HTMLDivElement | null> }>({})
  const confettiRef = useRef<any>(null)

  // Knowledge Map Refs
  const knowledgeContainerRef = useRef<HTMLDivElement>(null)
  const knowledgeBrainRef = useRef<HTMLDivElement>(null)
  const knowledgeFileRefs = useRef<{ [key: string]: React.RefObject<HTMLDivElement | null> }>({})

  // Reset stuck state on mount
  useEffect(() => {
    if (uploadStatus.status === 'uploading' && activeFiles.length === 0) {
      setUploadStatus({
        status: 'idle',
        message: '',
      })
    }
  }, [uploadStatus.status, activeFiles.length, setUploadStatus])

  // Fetch training statistics
  const fetchStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const data = await getTrainingStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch training stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  // Fetch trained files list
  const fetchTrainedFiles = useCallback(async () => {
    setLoadingFiles(true)
    try {
      // Add timestamp to prevent any caching
      const timestamp = new Date().getTime()
      const response = await fetch(`/api/trained-files?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      })
      if (response.ok) {
        const data = await response.json()
        console.log('[TrainingTab] Fetched trained files:', data.files?.length || 0)
        console.log('[TrainingTab] Files:', data.files?.map((f: any) => f.filename).join(', '))
        setTrainedFiles(data.files || [])
      }
    } catch (error) {
      console.error('Failed to fetch trained files:', error)
    } finally {
      setLoadingFiles(false)
    }
  }, [])

  // Delete/forget a trained file
  const handleForgetFile = useCallback(async (filename: string) => {
    // Ask for admin password
    const password = prompt('⚠️ Security Check\n\nEnter admin password to delete this file:')

    if (!password) {
      return // User cancelled
    }

    const toastId = toast.loading(`Verifying password...`, {
      description: 'Please wait',
    })

    // Verify password first
    try {
      const isValid = await verifyAdminPassword(password)

      if (!isValid) {
        toast.error('Access Denied', {
          id: toastId,
          description: 'Invalid admin password. Deletion cancelled.',
        })
        return
      }
    } catch (error) {
      toast.error('Verification Failed', {
        id: toastId,
        description: 'Could not verify password. Please try again.',
      })
      return
    }

    // Update toast to show deletion progress
    toast.loading(`Deleting ${filename}...`, {
      id: toastId,
      description: 'Removing training data from AI memory',
    })

    setDeletingFile(filename)
    try {
      await deleteTrainingFile(filename)

      // Refresh both stats and file list
      await Promise.all([fetchStats(), fetchTrainedFiles()])

      // Update toast to success
      toast.success(`Deleted ${filename}`, {
        id: toastId,
        description: `Successfully removed training data from AI memory`,
      })

      // Remove from selected files if it was selected
      setSelectedFiles(prev => {
        const newSet = new Set(prev)
        newSet.delete(filename)
        return newSet
      })
    } catch (error) {
      console.error('Failed to forget file:', error)
      toast.error(`Failed to delete ${filename}`, {
        id: toastId,
        description: 'An unexpected error occurred. Please try again.',
      })
    } finally {
      setDeletingFile(null)
    }
  }, [fetchStats, fetchTrainedFiles])

  // Delete multiple selected files
  const handleDeleteSelected = useCallback(async () => {
    if (selectedFiles.size === 0) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedFiles.size} file(s)?\n\nThis will permanently remove all training data for these files.`
    )

    if (!confirmed) return

    // Ask for admin password once for bulk deletion
    const password = prompt('⚠️ Security Check\n\nEnter admin password to delete selected files:')

    if (!password) {
      return // User cancelled
    }

    const toastId = toast.loading(`Verifying password...`, {
      description: 'Please wait',
    })

    // Verify password first
    try {
      const isValid = await verifyAdminPassword(password)

      if (!isValid) {
        toast.error('Access Denied', {
          id: toastId,
          description: 'Invalid admin password. Deletion cancelled.',
        })
        return
      }

      // Close verification toast
      toast.dismiss(toastId)
    } catch (error) {
      toast.error('Verification Failed', {
        id: toastId,
        description: 'Could not verify password. Please try again.',
      })
      return
    }

    // Delete each file with its own toast (skip password prompt since already verified)
    const filesToDelete = Array.from(selectedFiles)

    for (const filename of filesToDelete) {
      const deleteToastId = toast.loading(`Deleting ${filename}...`, {
        description: 'Removing training data from AI memory',
      })

      setDeletingFile(filename)
      try {
        await deleteTrainingFile(filename)

        // Refresh stats
        await Promise.all([fetchStats(), fetchTrainedFiles()])

        toast.success(`Deleted ${filename}`, {
          id: deleteToastId,
          description: `Successfully removed training data`,
        })
      } catch (error) {
        toast.error(`Failed to delete ${filename}`, {
          id: deleteToastId,
          description: 'An error occurred',
        })
      } finally {
        setDeletingFile(null)
      }
    }

    // Clear selection after all deletions
    setSelectedFiles(new Set())
  }, [selectedFiles, fetchStats, fetchTrainedFiles])

  // Toggle file selection
  const toggleFileSelection = useCallback((filename: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filename)) {
        newSet.delete(filename)
      } else {
        newSet.add(filename)
      }
      return newSet
    })
  }, [])

  // Select all files
  const handleSelectAll = useCallback(() => {
    if (selectedFiles.size === trainedFiles.length) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(trainedFiles.map(f => f.filename)))
    }
  }, [selectedFiles.size, trainedFiles])

  // View file content
  const handleViewFile = useCallback(async (filename: string) => {
    // Ask for admin password
    const password = prompt('🔒 Security Check\n\nEnter admin password to view this file:')

    if (!password) {
      return // User cancelled
    }

    const toastId = toast.loading('Verifying password...', {
      description: 'Please wait',
    })

    // Verify password first
    try {
      const isValid = await verifyAdminPassword(password)

      if (!isValid) {
        toast.error('Access Denied', {
          id: toastId,
          description: 'Invalid admin password. Access cancelled.',
        })
        return
      }

      // Close verification toast
      toast.dismiss(toastId)
    } catch (error) {
      toast.error('Verification Failed', {
        id: toastId,
        description: 'Could not verify password. Please try again.',
      })
      return
    }

    setLoadingView(true)
    try {
      const data = await viewFileContent(filename)

      setViewingFile({
        filename: filename,
        content: data.content,
        metadata: {},
      })

      toast.success('File Loaded', {
        description: `Viewing ${filename}`,
      })
    } catch (error) {
      console.error('Failed to view file:', error)
      toast.error('Failed to Load File', {
        description: 'Could not load file content. Please try again.',
      })
    } finally {
      setLoadingView(false)
    }
  }, [])

  // Download file content
  const handleDownloadFile = useCallback(async (filename: string) => {
    // Ask for admin password
    const password = prompt('🔒 Security Check\n\nEnter admin password to download this file:')

    if (!password) {
      return // User cancelled
    }

    const toastId = toast.loading('Verifying password...', {
      description: 'Please wait',
    })

    // Verify password first
    try {
      const isValid = await verifyAdminPassword(password)

      if (!isValid) {
        toast.error('Access Denied', {
          id: toastId,
          description: 'Invalid admin password. Download cancelled.',
        })
        return
      }

      // Update toast to show download progress
      toast.loading(`Downloading ${filename}...`, {
        id: toastId,
        description: 'Preparing file for download',
      })
    } catch (error) {
      toast.error('Verification Failed', {
        id: toastId,
        description: 'Could not verify password. Please try again.',
      })
      return
    }

    try {
      const blob = await downloadFile(filename)
      triggerFileDownload(blob, filename)

      toast.success('Download Started', {
        id: toastId,
        description: `${filename} is being downloaded`,
      })
    } catch (error) {
      console.error('Failed to download file:', error)
      toast.error('Download Failed', {
        id: toastId,
        description: 'Could not download file. Please try again.',
      })
    }
  }, [])

  // Initial fetch on mount
  useEffect(() => {
    fetchStats()
    fetchTrainedFiles()
  }, [fetchStats, fetchTrainedFiles])

  // Debounced refresh after successful upload (wait 1 second after last change)
  useEffect(() => {
    if (uploadStatus.status === 'success') {
      const debounceTimer = setTimeout(() => {
        console.log('[TrainingTab] Refreshing stats after upload completion')
        fetchStats()
        fetchTrainedFiles()
      }, 1000) // Wait 1 second after the last upload success

      return () => clearTimeout(debounceTimer)
    }
  }, [uploadStatus.status, fetchStats, fetchTrainedFiles])

  const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: any[]) => {
    // Handle rejected files (too large, wrong type, etc.)
    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(rejection => {
        if (rejection.errors.some((error: any) => error.code === 'file-too-large')) {
          return `${rejection.file.name}: File size exceeds 50MB limit`
        }
        if (rejection.errors.some((error: any) => error.code === 'file-invalid-type')) {
          return `${rejection.file.name}: Only PDF files are allowed`
        }
        return `${rejection.file.name}: File rejected`
      })

      setUploadStatus({
        status: 'error',
        message: errors.join('\n'),
      })
      return
    }

    if (acceptedFiles.length === 0) return

    // Filter only PDF files (additional check)
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf')

    if (pdfFiles.length === 0) {
      setUploadStatus({
        status: 'error',
        message: 'Please upload PDF files only',
      })
      return
    }

    // Add beforeunload listener to prevent accidental page close
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    // Process files one by one
    const initialActiveFiles = pdfFiles.map(f => ({
      id: Math.random().toString(36).substring(7),
      name: f.name,
      status: 'pending' as const
    }))
    setActiveFiles(initialActiveFiles)

    // Initialize refs for each file
    initialActiveFiles.forEach(af => {
      fileRefs.current[af.id] = { current: null }
    })

    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i]
      const activeFile = initialActiveFiles[i]

      // Update active file status
      setActiveFiles(prev => prev.map(af =>
        af.id === activeFile.id ? { ...af, status: 'processing' } : af
      ))

      setUploadStatus({
        status: 'uploading',
        message: `Processing ${i + 1} of ${pdfFiles.length}: ${file.name}...`,
        filename: file.name,
      })

      try {
        const data = await trainWithFile(file, chunkStrategy)

        // Check if it was a partial upload (timeout)
        if (data.partial) {
          setActiveFiles(prev => prev.map(af =>
            af.id === activeFile.id ? { ...af, status: 'error' } : af
          ))
          setUploadStatus({
            status: 'success',
            message: `⚠️ Partial upload for ${file.name}: Processed ${data.processed}/${data.total} chunks (timeout limit reached). Re-upload the same file to process remaining ${data.remaining} chunks.`,
            chunks: data.chunks,
          })

          // Show toast notification for partial upload
          toast.warning('Partial Upload Completed', {
            description: `${file.name} is too large. Processed ${data.processed}/${data.total} chunks. Please re-upload to continue.`,
            duration: 10000,
          })
        } else {
          successCount++
          setActiveFiles(prev => prev.map(af =>
            af.id === activeFile.id ? { ...af, status: 'completed' } : af
          ))

          // Show success toast with processing details
          const ocrInfo = data.ocr?.imagesProcessed > 0
            ? ` (+ ${data.ocr.imagesProcessed} images via ${data.ocr.provider.toUpperCase()} OCR)`
            : ''

          toast.success('File Trained Successfully', {
            description: `${file.name}: ${data.chunks} chunks processed in ${Math.round((data.processingTime || 0) / 1000)}s${ocrInfo}`,
          })
        }

        // Fetch stats and file list after each file
        await Promise.all([fetchStats(), fetchTrainedFiles()])
      } catch (error: any) {
        errorCount++
        setActiveFiles(prev => prev.map(af =>
          af.id === activeFile.id ? { ...af, status: 'error' } : af
        ))
        errors.push(`${file.name}: ${error.message || 'Failed to process'}`)
        console.error(`Error processing ${file.name}:`, error)

        // Show error toast
        toast.error('Training Failed', {
          description: `${file.name}: ${error.message || 'Unknown error'}`,
        })
      }
    }

    // Remove beforeunload listener after processing
    window.removeEventListener('beforeunload', handleBeforeUnload)

    // Set final status
    if (successCount === pdfFiles.length) {
      confettiRef.current?.fire()
      setUploadStatus({
        status: 'success',
        message: `Successfully processed all ${successCount} file(s)`,
        chunks: successCount,
      })
    } else if (successCount > 0) {
      setUploadStatus({
        status: 'success',
        message: `Processed ${successCount} of ${pdfFiles.length} files. ${errorCount} failed: ${errors.join(', ')}`,
        chunks: successCount,
      })
    } else {
      setUploadStatus({
        status: 'error',
        message: `All files failed to process: ${errors.join(', ')}`,
      })
    }
  }, [fetchStats, setUploadStatus, chunkStrategy, fetchTrainedFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: true, // Enable multiple file upload
    disabled: uploadStatus.status === 'uploading',
    maxSize: 50 * 1024 * 1024, // 50MB limit
  })

  const resetUpload = () => {
    setUploadStatus({
      status: 'idle',
      message: '',
    })
    setActiveFiles([])
    fileRefs.current = {}
  }

  const handleGoogleDocsImport = useCallback(async () => {
    const trimmed = googleDocsUrl.trim()
    if (!trimmed) return

    if (!trimmed.includes('docs.google.com') && !trimmed.includes('drive.google.com')) {
      toast.error('Invalid URL', { description: 'Please paste a Google Docs or Google Drive link.' })
      return
    }

    setImportingUrl(true)
    const toastId = toast.loading('Importing Google Doc…', { description: 'Fetching content from Google Docs' })

    try {
      const data = await trainWithGoogleDocsUrl(trimmed)

      if (data.partial) {
        toast.warning('Partial Import', {
          id: toastId,
          description: `Processed ${data.processed}/${data.total} sentences. Re-submit the link to continue.`,
          duration: 10000,
        })
      } else {
        toast.success(data.isUpdate ? 'Document Re-synced' : 'Document Imported', {
          id: toastId,
          description: `"${data.filename}" — ${data.sentences} sentences stored`,
        })
        setGoogleDocsUrl('')
      }

      await Promise.all([fetchStats(), fetchTrainedFiles()])
    } catch (error: any) {
      toast.error('Import Failed', {
        id: toastId,
        description: error.message || 'Could not import the Google Doc.',
      })
    } finally {
      setImportingUrl(false)
    }
  }, [googleDocsUrl, fetchStats, fetchTrainedFiles])

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* AI Provider Badge & OCR Badge */}
      <div className="flex justify-end gap-2 flex-wrap">
        <AIProviderBadge />
        <OCRProviderBadge />
      </div>

      {/* Training Statistics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {loadingStats || !stats ? (
          // Skeleton Loaders
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={`skeleton-${i}`} className="border-white/10 bg-black/40 backdrop-blur-xl relative overflow-hidden h-[88px] sm:h-[116px]">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
              <CardContent className="p-4 sm:p-6 flex flex-col justify-between h-full">
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-white/10 rounded animate-pulse" />
                  <div className="h-6 w-16 bg-white/20 rounded animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="border-white/10 bg-black/40 backdrop-blur-xl relative overflow-hidden group/stat hover:border-primary/30 transition-colors">
              <BorderBeam size={200} duration={12} delay={0} />
              <CardContent className="p-4 sm:p-6 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40">Total Chunks</p>
                    <div className="text-xl sm:text-3xl font-black text-primary drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                      <NumberTicker value={stats.totalChunks} />
                    </div>
                  </div>
                  <Database className="h-6 w-6 sm:h-8 sm:w-8 text-primary/30 group-hover/stat:text-primary/60 transition-colors" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-black/40 backdrop-blur-xl relative overflow-hidden group/stat hover:border-emerald-500/30 transition-colors">
              <BorderBeam size={200} duration={12} delay={3} />
              <CardContent className="p-4 sm:p-6 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40">Files Trained</p>
                    <div className="text-xl sm:text-3xl font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                      <NumberTicker value={stats.totalFiles} />
                    </div>
                  </div>
                  <FileStack className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-400/30 group-hover/stat:text-emerald-400/60 transition-colors" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-black/40 backdrop-blur-xl relative overflow-hidden group/stat hover:border-blue-400/30 transition-colors">
              <BorderBeam size={200} duration={12} delay={6} />
              <CardContent className="p-4 sm:p-6 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40">Knowledge Base</p>
                    <div className="text-xl sm:text-3xl font-black text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.3)]">
                      <NumberTicker value={stats.totalCharacters / 1000} decimalPlaces={1} />
                      <span className="text-sm ml-1 font-bold text-blue-400/60">KB</span>
                    </div>
                  </div>
                  <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400/30 group-hover/stat:text-blue-400/60 transition-colors" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-black/40 backdrop-blur-xl relative overflow-hidden group/stat hover:border-purple-400/30 transition-all duration-300">
              <BorderBeam size={200} duration={12} delay={9} />
              <CardContent className="p-4 sm:p-5 relative z-10">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40">Last Pulse</p>
                    <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-purple-400/40 group-hover/stat:text-purple-400/70 transition-colors" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm sm:text-base font-black text-purple-400">
                      {stats.lastTrainingDate
                        ? new Date(stats.lastTrainingDate).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })
                        : 'NO DATA'
                      }
                    </p>
                    <p className="text-[10px] sm:text-xs font-bold text-white/60">
                      {stats.lastTrainingDate
                        ? new Date(stats.lastTrainingDate).toLocaleString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })
                        : '--:--'
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card className="border-white/10 bg-white/5 backdrop-blur-xl relative overflow-hidden">
        <BorderBeam size={250} duration={15} delay={5} />
        <CardHeader className="p-4 sm:p-6">
          <Sparkles className="inline-block" density={40} size={1} speed={1.2} color="#34d399">
            <CardTitle className="text-xl sm:text-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
              <Link className="h-5 w-5 text-emerald-400" />
              Import from Google Docs
            </CardTitle>
          </Sparkles>
          <CardDescription className="text-xs sm:text-sm">
            Paste a Google Docs link to import its content directly — no download needed. Re-paste the same link anytime to sync the latest version.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
              <input
                type="url"
                value={googleDocsUrl}
                onChange={e => setGoogleDocsUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleGoogleDocsImport() }}
                placeholder="https://docs.google.com/document/d/..."
                disabled={importingUrl}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 disabled:opacity-50 transition-all"
              />
            </div>
            <button
              onClick={handleGoogleDocsImport}
              disabled={importingUrl || !googleDocsUrl.trim()}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {importingUrl
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                : <><RefreshCw className="h-4 w-4" /> Import / Sync</>}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-white/30">
            The document must be shared as <span className="text-emerald-400/70 font-medium">"Anyone with the link can view"</span> in Google Docs sharing settings.
          </p>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-xl relative overflow-hidden">
        <BorderBeam size={250} duration={15} delay={0} />
        <CardHeader className="p-4 sm:p-6">
          <Sparkles
            className="inline-block"
            density={60}
            size={1}
            speed={1.2}
            color="#a78bfa"
          >
            <CardTitle className="text-xl sm:text-2xl bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Train Your AI
            </CardTitle>
          </Sparkles>
          <CardDescription className="text-xs sm:text-sm">
            Upload PDF files to train the AI with your custom content. The text will be chunked
            and embedded for intelligent suggestions.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {/* Chunking Strategy Selector */}
          <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-white/10">
            <label className="block text-sm font-medium text-white mb-3">
              Text Extraction Strategy
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setChunkStrategy('word')}
                disabled={uploadStatus.status === 'uploading'}
                className={`p-3 rounded-lg border-2 transition-all text-left ${chunkStrategy === 'word'
                  ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/50'
                  : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                  } ${uploadStatus.status === 'uploading' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="font-medium text-white text-sm">Word by Word</div>
                <div className="text-xs text-white/60 mt-1">
                  Extract individual words from the text
                </div>
              </button>

              <button
                type="button"
                onClick={() => setChunkStrategy('sentence')}
                disabled={uploadStatus.status === 'uploading'}
                className={`p-3 rounded-lg border-2 transition-all text-left ${chunkStrategy === 'sentence'
                  ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/50'
                  : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                  } ${uploadStatus.status === 'uploading' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="font-medium text-white text-sm">Sentence by Sentence</div>
                <div className="text-xs text-white/60 mt-1">
                  Extract complete sentences (., !, ?)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setChunkStrategy('smart')}
                disabled={uploadStatus.status === 'uploading'}
                className={`p-3 rounded-lg border-2 transition-all text-left ${chunkStrategy === 'smart'
                  ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/50'
                  : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                  } ${uploadStatus.status === 'uploading' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="font-medium text-white text-sm">Smart Mode ⭐</div>
                <div className="text-xs text-white/60 mt-1">
                  Words + phrases + sentences (recommended)
                </div>
              </button>
            </div>
          </div>

          <div
            {...getRootProps()}
            className={`
              relative rounded-lg border-2 border-dashed p-6 sm:p-12 text-center transition-all min-h-[400px] flex flex-col items-center justify-center overflow-hidden
              ${isDragActive
                ? 'border-primary bg-primary/10'
                : 'border-white/20 hover:border-white/40 hover:bg-white/5'
              }
              ${uploadStatus.status === 'uploading' ? 'pointer-events-none' : 'cursor-pointer'}
            `}
          >
            <Confetti ref={confettiRef} manualstart />
            <Particles className="absolute inset-0 z-0" refresh={uploadStatus.status === 'uploading'} />

            {uploadStatus.status === 'uploading' && <Meteors number={15} />}

            <input {...getInputProps()} />

            {uploadStatus.status === 'idle' && (
              <div className="space-y-3 sm:space-y-4 z-10">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                  <div className="relative h-20 w-20 sm:h-24 sm:w-24 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 glass-morphism animate-float">
                    <Upload className="h-10 w-10 sm:h-12 sm:w-12 text-blue-400" />
                  </div>
                </div>
                <div>
                  <p className="text-sm sm:text-lg font-medium">
                    {isDragActive ? 'Drop your PDF files here' : 'Drop PDF files here or click to browse'}
                  </p>
                  <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">
                    Supports multiple PDF files up to 10MB each
                  </p>
                </div>
              </div>
            )}

            {uploadStatus.status === 'uploading' && (
              <div ref={containerRef} className="relative w-full h-full min-h-[300px] flex items-center justify-center z-10">
                {/* Central AI Brain Node */}
                <div
                  ref={brainRef}
                  className="z-20 relative flex h-24 w-24 sm:h-32 sm:w-32 items-center justify-center rounded-full border-2 border-primary/50 bg-black glass-morphism shadow-[0_0_50px_-12px_rgba(59,130,246,0.5)]"
                >
                  <div className="absolute inset-0 rounded-full animate-pulse bg-primary/10" />
                  <Image src="/icon.png" alt="AI Brain" width={120} height={120} className="relative z-30 h-16 w-16 sm:h-20 sm:w-20 animate-pulse object-contain" />
                </div>

                {/* Dynamical File Nodes */}
                <div className="absolute inset-0 flex items-center justify-around pointer-events-none">
                  {/* Left Side Files */}
                  <div className="flex flex-col gap-8 items-start ml-2 sm:ml-8">
                    {activeFiles.filter((_, i) => i % 2 === 0).map((af) => (
                      <div
                        key={af.id}
                        ref={(el) => { if (el) fileRefs.current[af.id] = { current: el } as any }}
                        className={`flex flex-col items-center gap-2 transition-all duration-500 scale-90 sm:scale-100 ${af.status === 'completed' ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'
                          }`}
                      >
                        <div className={`p-3 rounded-xl border border-white/10 glass-morphism shadow-xl relative ${af.status === 'processing' ? 'border-blue-500/50 scale-110' : ''
                          }`}>
                          {af.status === 'processing' && <div className="absolute inset-0 rounded-xl animate-ping border border-blue-500/30" />}
                          <FileIcon className={`h-6 w-6 sm:h-8 sm:w-8 ${af.status === 'processing' ? 'text-blue-400 animate-pulse' :
                            af.status === 'completed' ? 'text-emerald-400' :
                              af.status === 'error' ? 'text-red-400' : 'text-white/60'
                            }`} />
                        </div>
                        <span className="text-[10px] sm:text-xs text-white/50 max-w-[80px] truncate">{af.name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Right Side Files */}
                  <div className="flex flex-col gap-8 items-end mr-2 sm:mr-8">
                    {activeFiles.filter((_, i) => i % 2 !== 0).map((af) => (
                      <div
                        key={af.id}
                        ref={(el) => { if (el) fileRefs.current[af.id] = { current: el } as any }}
                        className={`flex flex-col items-center gap-2 transition-all duration-500 scale-90 sm:scale-100 ${af.status === 'completed' ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'
                          }`}
                      >
                        <div className={`p-3 rounded-xl border border-white/10 glass-morphism shadow-xl relative ${af.status === 'processing' ? 'border-blue-500/50 scale-110' : ''
                          }`}>
                          {af.status === 'processing' && <div className="absolute inset-0 rounded-xl animate-ping border border-blue-500/30" />}
                          <FileIcon className={`h-6 w-6 sm:h-8 sm:w-8 ${af.status === 'processing' ? 'text-blue-400 animate-pulse' :
                            af.status === 'completed' ? 'text-emerald-400' :
                              af.status === 'error' ? 'text-red-400' : 'text-white/60'
                            }`} />
                        </div>
                        <span className="text-[10px] sm:text-xs text-white/50 max-w-[80px] truncate">{af.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Render Upload Beams (Outside transform divs) */}
                {activeFiles.map((af, i) => af.status === 'processing' && (
                  <AnimatedBeam
                    key={`beam-${af.id}`}
                    containerRef={containerRef}
                    fromRef={fileRefs.current[af.id]}
                    toRef={brainRef}
                    reverse={i % 2 !== 0}
                    pathColor="rgba(59, 130, 246, 0.4)"
                    pathWidth={3}
                    gradientStartColor={i % 2 === 0 ? "#3b82f6" : "#8b5cf6"}
                    gradientStopColor={i % 2 === 0 ? "#8b5cf6" : "#3b82f6"}
                    curvature={i % 2 === 0 ? 40 : -40} // More pronounced curvature for clear visibility
                    duration={2.5}
                  />
                ))}

                <div className="absolute bottom-4 left-0 right-0 text-center flex flex-col items-center gap-2">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-xs sm:text-sm font-medium text-white/70 italic">{uploadStatus.message}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); resetUpload(); }}
                    className="text-[10px] text-white/30 hover:text-red-400 transition-colors underline underline-offset-2"
                  >
                    Stuck? Cancel & Reset
                  </button>
                </div>
              </div>
            )}

            {uploadStatus.status === 'success' && (
              <div className="space-y-4 z-10">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full" />
                  <div className="relative h-20 w-20 sm:h-24 sm:w-24 bg-white/5 rounded-2xl flex items-center justify-center border border-green-500/20 glass-morphism">
                    <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-green-500" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-medium text-green-500">Training Complete!</p>
                  <p className="mt-2 text-sm text-muted-foreground">{uploadStatus.message}</p>
                  {uploadStatus.chunks && (
                    <div className="mt-3 px-4 py-1 rounded-full bg-primary/10 border border-primary/20 inline-block">
                      <p className="text-xs font-semibold text-primary">
                        {uploadStatus.chunks} Document{uploadStatus.chunks !== 1 ? 's' : ''} Synced
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 justify-center">
                  <ShimmerButton
                    onClick={resetUpload}
                    className="mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                  >
                    Train More Data
                  </ShimmerButton>
                </div>
              </div>
            )}

            {uploadStatus.status === 'error' && (
              <div className="space-y-4 z-10">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
                  <div className="relative h-20 w-20 sm:h-24 sm:w-24 bg-white/5 rounded-2xl flex items-center justify-center border border-red-500/20 glass-morphism">
                    <XCircle className="h-10 w-10 sm:h-12 sm:w-12 text-red-500" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-medium text-red-500">Training Failed</p>
                  <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">{uploadStatus.message}</p>
                </div>
                <ShimmerButton
                  onClick={resetUpload}
                  className="mt-4 bg-gradient-to-r from-orange-600 to-red-600 text-white"
                >
                  Try Again
                </ShimmerButton>
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex gap-3">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How it works:</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>Upload a PDF document with the content you want the AI to learn</li>
                  <li>The text is automatically extracted and split into manageable chunks</li>
                  <li>Each chunk is converted to embeddings using OpenAI</li>
                  <li>Embeddings are stored in Supabase vector database</li>
                  <li>AI uses semantic search to provide relevant suggestions as you type</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Trained Files Visualization */}
          {trainedFiles.length > 0 && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-black/40 p-1 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
              <div ref={knowledgeContainerRef} className="relative h-[280px] sm:h-[350px] w-full flex items-center justify-center overflow-hidden">
                <Particles className="absolute inset-0 z-0 opacity-30" quantity={20} />

                {/* AI Core */}
                <div
                  ref={knowledgeBrainRef}
                  className="z-20 relative flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full border border-primary/30 bg-black glass-morphism shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)] overflow-hidden"
                >
                  <div className="absolute inset-0 rounded-full animate-pulse bg-primary/5" />
                  <Image src="/icon.png" alt="AI Brain" width={120} height={120} className="relative z-30 h-full w-full object-cover" />
                  <div className="absolute -bottom-6 text-[10px] font-bold text-primary/80 uppercase tracking-tighter">AI Core</div>
                </div>

                {/* Trained Sources */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Position up to 6 representative files in a circle */}
                  {trainedFiles.slice(0, 6).map((file, idx) => {
                    const angle = (idx * (360 / Math.min(6, trainedFiles.length))) - 90
                    const radius = typeof window !== 'undefined' && window.innerWidth < 640 ? 100 : 130
                    const x = Math.cos(angle * (Math.PI / 180)) * radius
                    const y = Math.sin(angle * (Math.PI / 180)) * radius

                    return (
                      <div
                        key={`vis-${file.filename}`}
                        style={{
                          transform: `translate(${x}px, ${y}px)`,
                        }}
                        className="absolute left-1/2 top-1/2 -ml-10 -mt-10 flex flex-col items-center gap-1"
                      >
                        <div
                          ref={(el) => { if (el) knowledgeFileRefs.current[file.filename] = { current: el } as any }}
                          className="rounded-lg border border-white/10 glass-morphism shadow-lg bg-black/40 overflow-hidden h-12 w-12 sm:h-16 sm:w-16 flex items-center justify-center"
                        >
                          <Image src="/file-icon.png" alt="File" width={64} height={64} className="w-full h-full object-cover transform scale-110" />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Render Knowledge Beams (Outside transform divs) */}
                {trainedFiles.slice(0, 6).map((file, idx) => (
                  <AnimatedBeam
                    key={`kbeam-${file.filename}`}
                    containerRef={knowledgeContainerRef}
                    fromRef={knowledgeFileRefs.current[file.filename]}
                    toRef={knowledgeBrainRef}
                    pathColor="rgba(59, 130, 246, 0.2)"
                    pathWidth={2}
                    gradientStartColor="#3b82f6"
                    gradientStopColor="#a855f7"
                    duration={Math.random() * 2 + 3}
                    delay={Math.random() * 2}
                    curvature={idx % 2 === 0 ? 30 : -30}
                  />
                ))}

                <div className="absolute top-4 left-4 flex flex-col items-start">
                  <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-widest">Active Knowledge Base</span>
                  <span className="text-xs text-white/40">{trainedFiles.length} Sources Integrated</span>
                </div>
              </div>
            </div>
          )}

          {/* Trained Files List */}
          {trainedFiles.length > 0 && (
            <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <FileStack className="h-5 w-5 shrink-0 text-emerald-400" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Trained Files ({trainedFiles.length})</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Select files to delete multiple at once
                  </p>
                </div>
                {trainedFiles.length > 0 && (
                  <div className="flex items-center gap-2">
                    {selectedFiles.size > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteSelected}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete ({selectedFiles.size})
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      className="gap-2"
                    >
                      {selectedFiles.size === trainedFiles.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {loadingFiles ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  trainedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.filename)}
                        onChange={() => toggleFileSelection(file.filename)}
                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0 cursor-pointer"
                      />
                      <FileText className="h-4 w-4 shrink-0 text-emerald-400/70" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm text-foreground truncate font-medium">
                          {file.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {file.chunkCount} chunk{file.chunkCount !== 1 ? 's' : ''} • {new Date(file.lastUpdated).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewFile(file.filename)}
                          disabled={loadingView}
                          className="shrink-0 h-8 w-8 p-0 hover:bg-blue-500/10 hover:text-blue-400 transition-colors"
                          title="View file content"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadFile(file.filename)}
                          className="shrink-0 h-8 w-8 p-0 hover:bg-green-500/10 hover:text-green-400 transition-colors"
                          title="Download file"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleForgetFile(file.filename)}
                          disabled={deletingFile === file.filename}
                          className="shrink-0 h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                          title="Forget this file"
                        >
                          {deletingFile === file.filename ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {trainedFiles.length > 0 && !loadingFiles && (
                <div className="mt-4 flex items-start gap-2 text-xs text-amber-500/80 bg-amber-500/5 p-3 rounded-lg border border-amber-500/20">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    Deleting a file will permanently remove all its training data from the AI's memory. This action cannot be undone.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View File Dialog */}
      <Dialog open={viewingFile !== null} onOpenChange={(open) => !open && setViewingFile(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-400" />
              {viewingFile?.filename}
            </DialogTitle>
            <DialogDescription>
              Viewing trained file content • {viewingFile?.content.length.toLocaleString()} characters
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <pre className="text-sm text-foreground/90 whitespace-pre-wrap bg-black/20 p-4 rounded-lg border border-white/10">
              {viewingFile?.content}
            </pre>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
            <Button
              variant="outline"
              onClick={() => viewingFile && handleDownloadFile(viewingFile.filename)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button
              variant="default"
              onClick={() => setViewingFile(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
