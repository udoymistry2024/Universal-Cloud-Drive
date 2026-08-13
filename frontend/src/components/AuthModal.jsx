import React, { useState, useEffect } from 'react'
import { Cloud, Lock, AtSign, ArrowRight, AlertCircle, KeyRound, MessageSquare, RefreshCw, CheckCircle2, Eye, EyeOff, UserX } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { requestForgotPasswordOtpApi, resetPasswordApi, getSignupStatusApi } from '../lib/api'

export const AuthModal = () => {
  const { signIn, sendOtp, register } = useAuth()
  
  // Mode: 'signin' | 'signup' | 'forgot'
  const [mode, setMode] = useState('signin')

  // Signup status check
  const [signupEnabled, setSignupEnabled] = useState(true)
  const [checkingSignupStatus, setCheckingSignupStatus] = useState(false)

  useEffect(() => {
    const fetchSignupStatus = async () => {
      try {
        setCheckingSignupStatus(true)
        const res = await getSignupStatusApi()
        if (res && typeof res.signup_enabled === 'boolean') {
          setSignupEnabled(res.signup_enabled)
        }
      } catch (err) {
        console.warn('Failed to fetch signup status:', err)
      } finally {
        setCheckingSignupStatus(false)
      }
    }
    fetchSignupStatus()
  }, [mode])
  
  // Form State
  const [telegramUsername, setTelegramUsername] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  
  // Password Visibility Toggles
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  // Step: 1 = Username/Password or Request OTP, 2 = Enter OTP verification
  const [step, setStep] = useState(1)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const getFriendlyErrorMessage = (err, fallback) => {
    let msg = err.response?.data?.detail || err.message || fallback
    if (typeof msg === 'string') {
      if (msg.toLowerCase().includes('already registered')) {
        return 'This Telegram username is already registered! Please log in.'
      }
      if (msg.toLowerCase().includes('closed by the administrator') || msg.toLowerCase().includes('registrations are currently closed')) {
        return '⚠️ New user registrations are currently closed by the administrator. Please try again later.'
      }
      if (msg.toLowerCase().includes('no account found') || msg.toLowerCase().includes('user account not found')) {
        return 'No account found with this Telegram username. Please check your username.'
      }
      if (msg.toLowerCase().includes('expired')) {
        return 'OTP has expired. Please resend a new code.'
      }
      if (msg.toLowerCase().includes('invalid verification code') || msg.toLowerCase().includes('invalid code')) {
        return 'Invalid verification code! Please check again.'
      }
    }
    return msg
  }

  const handleSignIn = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      await signIn(telegramUsername, password)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Authentication failed.'))
    } finally {
      setLoading(false)
    }
  }

  const handleSendOtp = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    const cleanUser = telegramUsername.trim().replace(/^@/, '')
    if (!cleanUser) {
      setError('Please enter your Telegram username.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    try {
      const res = await sendOtp(cleanUser)
      setMessage(res.message || `Verification code sent to @${cleanUser} via Telegram.`)
      setStep(2)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to send OTP code.'))
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    const cleanUser = telegramUsername.trim().replace(/^@/, '')
    const cleanOtp = otpCode.trim()

    if (!cleanOtp || cleanOtp.length !== 6) {
      setError('Please enter the 6-digit verification code.')
      return
    }

    setLoading(true)

    try {
      await register(cleanUser, password, cleanOtp)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  const handleSendForgotOtp = async (e) => {
    e?.preventDefault?.()
    setError('')
    setMessage('')

    const cleanUser = telegramUsername.trim().replace(/^@/, '')
    if (!cleanUser) {
      setError('Please enter your Telegram username.')
      return
    }

    setLoading(true)

    try {
      const res = await requestForgotPasswordOtpApi(cleanUser)
      setMessage(res.message || `Password reset verification code sent to @${cleanUser} via Telegram.`)
      setStep(2)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to send reset code.'))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    const cleanUser = telegramUsername.trim().replace(/^@/, '')
    const cleanOtp = otpCode.trim()

    if (!cleanOtp || cleanOtp.length !== 6) {
      setError('Please enter the 6-digit verification code.')
      return
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.')
      return
    }

    setLoading(true)

    try {
      const res = await resetPasswordApi(cleanUser, cleanOtp, newPassword)
      setMessage(res.message || 'Password reset successfully! You can now sign in.')
      setMode('signin')
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setOtpCode('')
      setStep(1)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to reset password.'))
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setStep(1)
    setError('')
    setMessage('')
    setOtpCode('')
    setPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4 sm:p-6 relative overflow-y-auto select-none">
      {/* Decorative background circles */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ucd-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-ucd-royal/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm bg-ucd-surface border border-ucd-border rounded-2xl shadow-2xl p-6 md:p-8 relative z-10 my-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-ucd-accent/20 to-ucd-royal/20 border border-ucd-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Cloud className="w-8 h-8 text-ucd-accent" />
          </div>
          <h2 className="text-xl font-bold text-ucd-text tracking-tight">
            {mode === 'signup'
              ? (!signupEnabled ? 'Registrations Paused' : (step === 1 ? 'Create Account' : 'Verify Telegram OTP'))
              : mode === 'forgot'
              ? (step === 1 ? 'Reset Password' : 'Enter Reset Code')
              : 'Welcome Back'}
          </h2>
          <p className="text-xs text-ucd-dim mt-1">
            Universal Cloud Drive — Telegram Auth Storage
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-2 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Success / Info Message */}
        {message && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start space-x-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{message}</span>
          </div>
        )}

        {/* Form rendering */}
        {mode === 'signin' ? (
          /* LOGIN FORM */
          <form onSubmit={handleSignIn} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-ucd-dim mb-1">Telegram Username</label>
              <div className="relative">
                <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-dim" />
                <input
                  type="text"
                  required
                  placeholder="username (e.g. udoymistry)"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-ucd-dim">Password</label>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline transition-colors font-medium"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-dim" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ucd-dim hover:text-ucd-accent transition-colors p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-glow-btn hover:shadow-glow-lg transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-40"
            >
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : mode === 'forgot' ? (
          step === 1 ? (
            /* FORGOT PASSWORD - STEP 1: Enter Username */
            <form onSubmit={handleSendForgotOtp} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ucd-dim mb-1">Telegram Username</label>
                <div className="relative">
                  <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-dim" />
                  <input
                    type="text"
                    required
                    placeholder="username (without @)"
                    value={telegramUsername}
                    onChange={(e) => setTelegramUsername(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
                  />
                </div>
              </div>

              {/* Telegram Bot Guidance Notice */}
              <div className="p-2.5 bg-ucd-accent/5 border border-ucd-accent/15 rounded-xl text-[11px] text-ucd-dim flex items-start space-x-2 leading-relaxed">
                <MessageSquare className="w-3.5 h-3.5 text-ucd-accent shrink-0 mt-0.5" />
                <span>
                  ⚠️ <strong>Notice:</strong> We will send a 6-digit reset code to your Telegram DM via our{' '}
                  <a
                    href="https://t.me/ucdrive_otp_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:text-sky-300 underline font-semibold transition-colors"
                  >
                    OTP Bot
                  </a>.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-glow-btn hover:shadow-glow-lg transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-40"
              >
                <span>{loading ? 'Sending Code...' : 'Send Reset Code'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-xs text-ucd-dim hover:text-ucd-text transition-colors"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          ) : (
            /* FORGOT PASSWORD - STEP 2: Enter OTP & New Password */
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ucd-dim mb-1">6-Digit Reset Code</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-accent" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-10 pr-3 py-2.5 bg-ucd-bg border border-ucd-accent/40 rounded-xl outline-none focus:border-ucd-accent focus:ring-2 focus:ring-ucd-accent/30 text-center tracking-[0.4em] font-mono text-lg font-bold text-ucd-text placeholder:tracking-normal placeholder:font-sans placeholder:text-xs placeholder:text-ucd-dim"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ucd-dim mb-1">New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-dim" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ucd-dim hover:text-ucd-accent transition-colors p-1"
                    title={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ucd-dim mb-1">Confirm New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-dim" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ucd-dim hover:text-ucd-accent transition-colors p-1"
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-glow-btn hover:shadow-glow-lg transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-40"
              >
                <span>{loading ? 'Resetting Password...' : 'Reset Password'}</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-between pt-1 text-xs text-ucd-dim">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="hover:text-ucd-text transition-colors"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleSendForgotOtp}
                  disabled={loading}
                  className="flex items-center space-x-1 hover:text-ucd-accent transition-colors disabled:opacity-40"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Resend Code</span>
                </button>
              </div>
            </form>
          )
        ) : !signupEnabled ? (
          /* REGISTRATION PAUSED NOTICE CARD */
          <div className="text-center py-2 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-glow">
              <UserX className="w-8 h-8 text-amber-400" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">Registrations Currently Closed</h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
                New user account registrations are temporarily paused by the administrator. Please check back later.
              </p>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 font-medium leading-relaxed">
              📢 Existing users can sign in using their username and password below.
            </div>

            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="w-full py-3 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-glow-btn hover:shadow-glow-lg transition-all flex items-center justify-center space-x-2 text-sm"
            >
              <span>Back to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : step === 1 ? (
          /* SIGN UP - STEP 1: Details */
          <form onSubmit={handleSendOtp} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-ucd-dim mb-1">Telegram Username</label>
              <div className="relative">
                <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-dim" />
                <input
                  type="text"
                  required
                  placeholder="username (without @)"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ucd-dim mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-dim" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl outline-none focus:border-ucd-accent/50 focus:ring-1 focus:ring-ucd-accent/20 text-sm text-ucd-text placeholder:text-ucd-dim"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ucd-dim hover:text-ucd-accent transition-colors p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Telegram Bot Guidance Notice */}
            <div className="p-2.5 bg-ucd-accent/5 border border-ucd-accent/15 rounded-xl text-[11px] text-ucd-dim flex items-start space-x-2 leading-relaxed">
              <MessageSquare className="w-3.5 h-3.5 text-ucd-accent shrink-0 mt-0.5" />
              <span>
                ⚠️ <strong>Important:</strong> Before clicking "Send OTP Code", please click here to open our{' '}
                <a
                  href="https://t.me/ucdrive_otp_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300 underline font-semibold transition-colors"
                >
                  OTP Verification Bot
                </a>{' '}
                on Telegram and press <strong>'/start'</strong> to activate OTP delivery!
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-glow-btn hover:shadow-glow-lg transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-40"
            >
              <span>{loading ? 'Sending Code...' : 'Send OTP Code'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          /* SIGN UP - STEP 2: Verification Code (OTP) Box */
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-ucd-dim mb-1">Enter 6-Digit OTP Code</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ucd-accent" />
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-10 pr-3 py-3 bg-ucd-bg border border-ucd-accent/40 rounded-xl outline-none focus:border-ucd-accent focus:ring-2 focus:ring-ucd-accent/30 text-center tracking-[0.4em] font-mono text-lg font-bold text-ucd-text placeholder:tracking-normal placeholder:font-sans placeholder:text-xs placeholder:text-ucd-dim"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-ucd-accent to-ucd-royal hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-glow-btn hover:shadow-glow-lg transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-40"
            >
              <span>{loading ? 'Creating Account...' : 'Verify & Create Account'}</span>
              <CheckCircle2 className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pt-1 text-xs text-ucd-dim">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="hover:text-ucd-text transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading}
                className="flex items-center space-x-1 hover:text-ucd-accent transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Resend Code</span>
              </button>
            </div>
          </form>
        )}

        {/* Toggle Sign-In / Sign-Up */}
        <div className="mt-5 text-center">
          <button
            onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
            className="text-xs text-ucd-muted hover:text-ucd-accent hover:underline transition-colors"
          >
            {mode === 'signup' ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  )
}
