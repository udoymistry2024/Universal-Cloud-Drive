export const formatBytes = (bytes, decimals = 1) => {
  const num = Number(bytes)
  if (isNaN(num) || !num || num <= 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(num) / Math.log(k))
  return parseFloat((num / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export const formatDate = (dateStr) => {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString()
  } catch (e) {
    return ''
  }
}

export const formatSpeed = (bytesPerSec) => {
  const num = Number(bytesPerSec)
  if (isNaN(num) || !num || num <= 0 || !isFinite(num)) return '0 KB/s'
  if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB/s`
  if (num >= 1024) return `${(num / 1024).toFixed(0)} KB/s`
  return `${Math.round(num)} B/s`
}

export const formatETA = (seconds) => {
  const num = Number(seconds)
  if (isNaN(num) || !num || num <= 0 || !isFinite(num)) return ''
  if (num < 60) return `${Math.round(num)}s left`
  const mins = Math.floor(num / 60)
  const secs = Math.round(num % 60)
  return `${mins}m ${secs}s left`
}

export const getFileCategory = (mimeType = '', filename = '') => {
  const safeMime = (mimeType || '').toString().toLowerCase()
  const safeName = (filename || '').toString().toLowerCase()
  const ext = safeName.includes('.') ? safeName.split('.').pop() || '' : ''

  if (safeMime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'heif', 'tiff', 'avif'].includes(ext)) return 'image'
  if (safeMime.startsWith('video/') || ['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', '3gp', 'm4v', 'ts', 'ogv', 'mpg', 'mpeg'].includes(ext)) return 'video'
  if (safeMime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus', 'wma', 'aiff', 'alac'].includes(ext)) return 'audio'
  if (safeMime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (safeMime.includes('text') || ['txt', 'js', 'jsx', 'ts', 'tsx', 'json', 'py', 'html', 'css', 'scss', 'md', 'csv', 'log', 'xml', 'yaml', 'yml', 'sh', 'bat', 'c', 'cpp', 'h', 'java', 'sql', 'env', 'ipynb'].includes(ext)) return 'text'
  if (safeMime.includes('zip') || safeMime.includes('compressed') || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'bin', 'exe', 'apk', 'dmg'].includes(ext)) return 'archive'

  return 'other'
}

export const copyToClipboard = async (text) => {
  if (!text) return false

  // Method 1: Modern navigator.clipboard API (works on HTTPS / localhost)
  if (typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) {
      console.warn('navigator.clipboard.writeText failed, trying fallback:', e)
    }
  }

  // Method 2: Legacy execCommand fallback (works on HTTP / non-secure contexts)
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.top = '0'
    textArea.style.left = '0'
    textArea.style.width = '2em'
    textArea.style.height = '2em'
    textArea.style.padding = '0'
    textArea.style.border = 'none'
    textArea.style.outline = 'none'
    textArea.style.boxShadow = 'none'
    textArea.style.background = 'transparent'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)
    if (successful) return true
  } catch (err) {
    console.error('Fallback copyToClipboard failed:', err)
  }

  return false
}

