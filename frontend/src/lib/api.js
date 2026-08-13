import axios from 'axios'

const getDynamicApiUrl = () => {
  // Prioritize current browser location so mobile devices on local Wi-Fi (e.g. 192.168.0.X) connect seamlessly
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname
    const protocol = window.location.protocol || 'http:'
    const port = window.location.port

    // Dev server running on 5173 or 3000 -> point to backend on port 8000 of the same IP/hostname
    if (port === '5173' || port === '3000' || !port) {
      return `${protocol}//${hostname}:8000`
    }
  }

  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && envUrl.trim() !== '' && !envUrl.includes('localhost')) return envUrl.trim()

  return 'http://localhost:8000'
}

export const API_BASE_URL = getDynamicApiUrl()

const api = axios.create({
  baseURL: API_BASE_URL
})

// Request interceptor to attach custom JWT token automatically from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ucd_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

// Response interceptor to handle 401 Unauthorized & 403 Banned errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    const isAuthRoute = url.includes('/api/auth/login') ||
                        url.includes('/api/auth/send-code') ||
                        url.includes('/api/auth/register') ||
                        url.includes('/api/auth/forgot-password')

    if ((status === 401 || status === 403) && !isAuthRoute) {
      console.warn('Unauthorized or Banned API response caught by interceptor.')
      localStorage.removeItem('ucd_token')
      localStorage.removeItem('ucd_user')
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/share/')) {
        window.dispatchEvent(new Event('ucd_auth_logout'))
      }
    }
    return Promise.reject(error)
  }
)

// ─── AUTHENTICATION API ─────────────────────────────────

export const sendOtpApi = async (telegramUsername) => {
  const response = await api.post('/api/auth/send-code', { telegram_username: telegramUsername })
  return response.data
}

export const registerApi = async (telegramUsername, password, otpCode) => {
  const response = await api.post('/api/auth/register', {
    telegram_username: telegramUsername,
    password,
    otp_code: otpCode
  })
  return response.data
}

export const loginApi = async (telegramUsername, password) => {
  const response = await api.post('/api/auth/login', {
    telegram_username: telegramUsername,
    password
  })
  return response.data
}

export const requestForgotPasswordOtpApi = async (telegramUsername) => {
  const response = await api.post('/api/auth/forgot-password/request-otp', { telegram_username: telegramUsername })
  return response.data
}

export const resetPasswordApi = async (telegramUsername, otpCode, newPassword) => {
  const response = await api.post('/api/auth/forgot-password/reset', {
    telegram_username: telegramUsername,
    otp_code: otpCode,
    new_password: newPassword
  })
  return response.data
}

export const getMeApi = async () => {
  const response = await api.get('/api/auth/me')
  return response.data
}

export const getSignupStatusApi = async () => {
  const response = await api.get('/api/auth/signup-status')
  return response.data
}

export const requestDeleteAccountOtpApi = async (password, confirmationPhrase) => {
  const response = await api.post('/api/auth/delete-account/request-otp', {
    password,
    confirmation_phrase: confirmationPhrase
  })
  return response.data
}

export const confirmDeleteAccountApi = async (password, confirmationPhrase, otpCode) => {
  const response = await api.delete('/api/auth/delete-account', {
    data: {
      password,
      confirmation_phrase: confirmationPhrase,
      otp_code: otpCode
    }
  })
  return response.data
}

// ─── FILE & FOLDER API ─────────────────────────────────

export const uploadFile = async (file, folderId, onProgress, cancelSignal, uploadId = null) => {
  const formData = new FormData()
  formData.append('file', file)
  if (folderId) {
    formData.append('folder_id', folderId)
  }
  if (uploadId) {
    formData.append('upload_id', uploadId)
  }

  let lastLoaded = 0
  let lastTime = Date.now()

  const response = await api.post('/api/files/upload', formData, {
    signal: cancelSignal,
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total) {
        const now = Date.now()
        const loaded = progressEvent.loaded
        const total = progressEvent.total
        const percent = Math.round((loaded * 100) / total)

        const timeDiff = (now - lastTime) / 1000
        let speed = 0
        if (timeDiff > 0.25 || percent === 100) {
          const bytesDiff = loaded - lastLoaded
          speed = timeDiff > 0 ? bytesDiff / timeDiff : 0
          lastLoaded = loaded
          lastTime = now
        }

        const remainingBytes = total - loaded
        const etaSeconds = speed > 0 ? Math.round(remainingBytes / speed) : 0

        onProgress?.({
          stage: 'local',
          percent,
          loaded,
          total,
          speed,
          etaSeconds
        })
      }
    }
  })

  return response.data
}

export const getFiles = async (folderId = null, isStarred = null, isTrash = false, signal = null) => {
  const params = { is_trash: isTrash }
  if (folderId) params.folder_id = folderId
  if (isStarred !== null) params.is_starred = isStarred

  const response = await api.get('/api/files/list', { params, signal })
  return response.data
}

export const updateFile = async (fileId, payload) => {
  const response = await api.patch(`/api/files/${fileId}`, payload)
  return response.data
}

export const deleteFile = async (fileId) => {
  const response = await api.delete(`/api/files/${fileId}`)
  return response.data
}

export const getFolders = async (parentId = null, isTrash = false, signal = null) => {
  const params = { is_trash: isTrash }
  if (parentId) params.parent_id = parentId

  const response = await api.get('/api/folders/list', { params, signal })
  return response.data
}

export const createFolder = async (name, parentId = null) => {
  const response = await api.post('/api/folders', { name, parent_id: parentId })
  return response.data
}

export const updateFolder = async (folderId, payload) => {
  const response = await api.patch(`/api/folders/${folderId}`, payload)
  return response.data
}

export const deleteFolder = async (folderId) => {
  const response = await api.delete(`/api/folders/${folderId}`)
  return response.data
}

export const emptyTrash = async () => {
  const response = await api.post('/api/folders/empty-trash')
  return response.data
}

export const getDownloadUrl = (fileId) => {
  const token = localStorage.getItem('ucd_token') || ''
  return `${API_BASE_URL}/api/files/download/${fileId}?token=${token}`
}

export const getStreamUrl = (fileId) => {
  const token = localStorage.getItem('ucd_token') || ''
  return `${API_BASE_URL}/api/files/stream/${fileId}?token=${token}`
}

export const getThumbnailUrl = (fileId) => {
  const token = localStorage.getItem('ucd_token') || ''
  return `${API_BASE_URL}/api/files/thumbnail/${fileId}?token=${token}`
}

// ─── PUBLIC SHARED API ─────────────────────────────────

export const shareFile = async (fileId) => {
  const response = await api.post(`/api/shared/file/${fileId}`)
  return response.data
}

export const shareFolder = async (folderId) => {
  const response = await api.post(`/api/shared/folder/${folderId}`)
  return response.data
}

export const getPublicFileInfo = async (shareToken) => {
  const response = await axios.get(`${API_BASE_URL}/api/shared/file/${shareToken}`)
  return response.data
}

export const getPublicFolderInfo = async (shareToken, folderId = null) => {
  const params = folderId ? { folder_id: folderId } : {}
  const response = await axios.get(`${API_BASE_URL}/api/shared/folder/${shareToken}`, { params })
  return response.data
}

export const getPublicDownloadUrl = (shareToken) => {
  return `${API_BASE_URL}/api/shared/download/${shareToken}`
}

export const getPublicStreamUrl = (shareToken) => {
  return `${API_BASE_URL}/api/shared/stream/${shareToken}`
}

export const getPublicFileDownloadUrl = (shareToken, fileId) => {
  return `${API_BASE_URL}/api/shared/download-file/${shareToken}/${fileId}`
}

export const getPublicFileStreamUrl = (shareToken, fileId) => {
  return `${API_BASE_URL}/api/shared/stream-file/${shareToken}/${fileId}`
}

export const getPublicThumbnailUrl = (shareToken, fileId) => {
  return `${API_BASE_URL}/api/shared/thumbnail/${shareToken}/${fileId}`
}


export const requestStorageApi = async (fullName, email, reason) => {
  const response = await api.post('/api/users/request-storage', {
    full_name: fullName,
    email: email,
    reason: reason
  })
  return response.data
}

export const moveItemApi = async (itemId, itemType, destinationFolderId = null) => {
  const response = await api.post('/api/files/move', {
    item_id: itemId,
    item_type: itemType,
    destination_folder_id: destinationFolderId
  })
  return response.data
}

export const copyItemApi = async (itemId, itemType, destinationFolderId = null) => {
  const response = await api.post('/api/files/copy', {
    item_id: itemId,
    item_type: itemType,
    destination_folder_id: destinationFolderId
  })
  return response.data
}

export default api
