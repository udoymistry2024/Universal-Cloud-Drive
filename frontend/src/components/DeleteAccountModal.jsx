import React, { useState, useEffect } from 'react'
import { AlertTriangle, Trash2, X, Lock, Loader2, ShieldAlert, ArrowRight, KeyRound, Send, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { requestDeleteAccountOtpApi, confirmDeleteAccountApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useDrive } from '../context/DriveContext'

export const DeleteAccountModal = ({ isOpen, onClose }) => {
  const { user, signOut } = useAuth()
  const { showToast } = useDrive() || {}

  const [step, setStep] = useState(1) // Step 1: Password, Step 2: Phrase, Step 3: Telegram OTP
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [confirmationPhrase, setConfirmationPhrase] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Resend Countdown Timer for OTP
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    let timer
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(prev => prev - 1), 1000)
    }
    return () => clearInterval(timer)
  }, [countdown])

  if (!isOpen) return null

  const REQUIRED_PHRASE = 'I am sure I want to delete my account'

  const handleStep1Submit = (e) => {
    e.preventDefault()
    setError('')
    if (!password || password.trim() === '') {
      setError('Please enter your account password to verify identity.')
      return
    }
    setStep(2)
  }

  const handleStep2RequestOtp = async (e) => {
    e.preventDefault()
    setError('')

    if (confirmationPhrase.trim() !== REQUIRED_PHRASE) {
      setError(`Confirmation text must match exactly: "${REQUIRED_PHRASE}"`)
      return
    }

    setLoading(true)
    try {
      await requestDeleteAccountOtpApi(password, confirmationPhrase)
      showToast?.(`Verification code sent to @${user?.telegram_username} via Telegram`, 'success')
      setStep(3)
      setCountdown(60)
    } catch (err) {
      console.error('Request deletion OTP error:', err)
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to send OTP. Please check your password.'
      setError(errorMsg)
      if (err.response?.status === 400 && errorMsg.toLowerCase().includes('password')) {
        setStep(1) // Return to password step if password was invalid
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (countdown > 0 || loading) return
    setError('')
    setLoading(true)
    try {
      await requestDeleteAccountOtpApi(password, confirmationPhrase)
      showToast?.(`New verification code sent to @${user?.telegram_username}`, 'success')
      setCountdown(60)
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to resend code.'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleFinalDeleteWithOtp = async (e) => {
    e.preventDefault()
    setError('')

    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code sent to your Telegram.')
      return
    }

    setLoading(true)
    try {
      await confirmDeleteAccountApi(password, confirmationPhrase, otpCode.trim())
      showToast?.('Your account and all files have been permanently deleted.', 'success')
      signOut()
      onClose()
    } catch (err) {
      console.error('Final account deletion error:', err)
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to delete account. Invalid OTP code.'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setStep(1)
    setPassword('')
    setConfirmationPhrase('')
    setOtpCode('')
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-ucd-surface border border-rose-500/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col my-auto max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-rose-500/20 bg-rose-500/10 shrink-0">
          <div className="flex items-center space-x-2 text-rose-400">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h3 className="font-bold text-sm sm:text-base text-white">Delete Account (3-Step Verification)</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-rose-500/20 transition-colors disabled:opacity-50 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
          
          {/* Permanent Warning Notice */}
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1.5">
            <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Permanent Account Destruction</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Deleting your account will <strong className="text-rose-400">permanently erase</strong> your user profile, all folders, and all files stored in Telegram. This action is <strong className="text-rose-400">IRREVERSIBLE</strong>.
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-ucd-bg/60 border border-ucd-border rounded-xl text-center text-[11px] font-semibold">
            <div className={`py-1.5 rounded-lg transition-colors ${step >= 1 ? 'bg-rose-500/20 text-rose-300' : 'text-slate-500'}`}>
              1. Password
            </div>
            <div className={`py-1.5 rounded-lg transition-colors ${step >= 2 ? 'bg-rose-500/20 text-rose-300' : 'text-slate-500'}`}>
              2. Phrase
            </div>
            <div className={`py-1.5 rounded-lg transition-colors ${step >= 3 ? 'bg-rose-500/20 text-rose-300' : 'text-slate-500'}`}>
              3. Telegram OTP
            </div>
          </div>

          {/* User badge */}
          <div className="flex items-center justify-between p-2.5 bg-ucd-bg/50 border border-ucd-border rounded-xl">
            <span className="text-xs text-ucd-dim font-medium">Username:</span>
            <span className="text-xs font-bold text-ucd-accent">@{user?.telegram_username}</span>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-400 font-medium animate-in fade-in">
              {error}
            </div>
          )}

          {/* STEP 1: PASSWORD VERIFICATION */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ucd-text flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5 text-ucd-accent" />
                  <span>Enter Account Password</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                    className="w-full pl-3.5 pr-10 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl text-xs md:text-sm text-white placeholder:text-ucd-dim focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-md transition-colors"
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 bg-ucd-bg hover:bg-ucd-hover text-ucd-text text-xs font-semibold rounded-xl transition-colors border border-ucd-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white text-xs font-bold rounded-xl shadow-glow transition-all active:scale-95"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: CONFIRMATION PHRASE ENTRY */}
          {step === 2 && (
            <form onSubmit={handleStep2RequestOtp} className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200 leading-relaxed block">
                  Please type the following exact phrase:
                </label>
                <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-center select-all">
                  <code className="text-xs font-mono font-bold text-rose-400 select-all">
                    {REQUIRED_PHRASE}
                  </code>
                </div>

                <input
                  type="text"
                  placeholder={REQUIRED_PHRASE}
                  value={confirmationPhrase}
                  onChange={(e) => setConfirmationPhrase(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 bg-ucd-bg border border-ucd-border rounded-xl text-xs md:text-sm text-white placeholder:text-slate-600 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 outline-none transition-all"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="text-xs text-ucd-dim hover:text-ucd-text transition-colors"
                >
                  &larr; Back
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="px-4 py-2 bg-ucd-bg hover:bg-ucd-hover text-ucd-text text-xs font-semibold rounded-xl transition-colors border border-ucd-border disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={confirmationPhrase.trim() !== REQUIRED_PHRASE || loading}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold rounded-xl shadow-glow transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending OTP...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Telegram OTP</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* STEP 3: TELEGRAM OTP CODE VERIFICATION */}
          {step === 3 && (
            <form onSubmit={handleFinalDeleteWithOtp} className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
                <div className="flex items-center space-x-1.5 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>OTP Sent to Telegram DM</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Check your Telegram DM from <strong>@ucdrive_otp_bot</strong> for your 6-digit verification code.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ucd-text flex items-center space-x-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-ucd-accent" />
                    <span>Enter 6-Digit Telegram OTP</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={countdown > 0 || loading}
                    className="text-[11px] text-ucd-accent hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                  </button>
                </div>

                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                  className="w-full px-3.5 py-3 bg-ucd-bg border border-ucd-border rounded-xl text-center text-lg font-mono font-bold tracking-widest text-white placeholder:text-slate-700 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 outline-none transition-all"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="text-xs text-ucd-dim hover:text-ucd-text transition-colors"
                >
                  &larr; Back
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="px-4 py-2 bg-ucd-bg hover:bg-ucd-hover text-ucd-text text-xs font-semibold rounded-xl transition-colors border border-ucd-border disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={otpCode.trim().length !== 6 || loading}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white text-xs font-bold rounded-xl shadow-glow transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Deleting Everything...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Verify & Delete My Account</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
