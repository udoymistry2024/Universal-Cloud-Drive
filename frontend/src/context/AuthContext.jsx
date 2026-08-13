import React, { createContext, useContext, useEffect, useState } from 'react'
import { sendOtpApi, registerApi, loginApi, getMeApi } from '../lib/api'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
  // Synchronous initialization from cached user in localStorage if token exists
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('ucd_token')
    const savedUser = localStorage.getItem('ucd_user')
    if (token && savedUser) {
      try {
        return JSON.parse(savedUser)
      } catch (e) {
        return null
      }
    }
    return null
  })

  // Loading is only true if we have a token but no cached user profile yet
  const [loading, setLoading] = useState(() => {
    const token = localStorage.getItem('ucd_token')
    const savedUser = localStorage.getItem('ucd_user')
    return Boolean(token && !savedUser)
  })

  const checkUserAuth = async (retries = 2) => {
    const token = localStorage.getItem('ucd_token')
    if (!token) {
      localStorage.removeItem('ucd_user')
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const userData = await getMeApi()
      if (userData) {
        localStorage.setItem('ucd_user', JSON.stringify(userData))
        setUser(userData)
      }
    } catch (err) {
      const status = err.response?.status
      console.warn('Authentication check warning:', err.message || err)

      // Only logout if the backend explicitly responds with 401 Unauthorized or 403 Banned
      if (status === 401 || status === 403) {
        console.warn('Session invalid or user banned. Logging out...')
        localStorage.removeItem('ucd_token')
        localStorage.removeItem('ucd_user')
        setUser(null)
      } else if (retries > 0) {
        // If transient network or server error, retry silently after 600ms without logging out
        setTimeout(() => checkUserAuth(retries - 1), 600)
        return
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkUserAuth()

    const handleLogoutEvent = () => {
      setUser(null)
      setLoading(false)
    }

    window.addEventListener('ucd_auth_logout', handleLogoutEvent)
    return () => window.removeEventListener('ucd_auth_logout', handleLogoutEvent)
  }, [])

  const sendOtp = async (telegramUsername) => {
    return await sendOtpApi(telegramUsername)
  }

  const register = async (telegramUsername, password, otpCode) => {
    const data = await registerApi(telegramUsername, password, otpCode)
    if (data.token) {
      localStorage.setItem('ucd_token', data.token)
      if (data.user) {
        localStorage.setItem('ucd_user', JSON.stringify(data.user))
        setUser(data.user)
      }
      await checkUserAuth()
    }
    return data
  }

  const signIn = async (telegramUsername, password) => {
    const data = await loginApi(telegramUsername, password)
    if (data.token) {
      localStorage.setItem('ucd_token', data.token)
      if (data.user) {
        localStorage.setItem('ucd_user', JSON.stringify(data.user))
        setUser(data.user)
      }
      await checkUserAuth()
    }
    return data
  }

  const signOut = () => {
    localStorage.removeItem('ucd_token')
    localStorage.removeItem('ucd_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, sendOtp, register, signIn, signOut, checkUserAuth, refreshUser: checkUserAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
