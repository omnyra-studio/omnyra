'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AnimatedBackground from '@/components/AnimatedBackground'
import { usePostHog } from 'posthog-js/react'


export default function VoiceStudioPage() {
  const router = useRouter()
  const posthog = usePostHog()
  const supabase = createClient()

  // Auth
  const [userId, setUserId] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [accessToken, setAccessToken] = useState(null)

  // Saved voice
  const [savedVoice, setSavedVoice] = useState(null)

  // Voice library
  const [voices, setVoices] = useState([])
  const [voicesLoading, setVoicesLoading] = useState(true)
  const [selectedVoiceId, setSelectedVoiceId] = useState(null)
  const [savingVoice, setSavingVoice] = useState(false)
  const [playingVoiceId, setPlayingVoiceId] = useState(null)
  const audioRef = useRef(null)

  // Clone tab
  const [cloneTab, setCloneTab] = useState('record') // 'record' | 'upload'

  // Recording
  const [isRecording, setIsRecording] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const mediaRecorderRef = useRef(null)
  const countdownRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const [barHeights, setBarHeights] = useState(Array(20).fill(4))

  // Upload
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadedUrl, setUploadedUrl] = useState(null)
  const fileInputRef = useRef(null)

  // Cloning
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneSuccess, setCloneSuccess] = useState(null)
  const [cloneError, setCloneError] = useState(null)

  // Test voice
  const [testText, setTestText] = useState("Discover what your audience actually wants to see — before you even hit record.")
  const [testingVoice, setTestingVoice] = useState(false)
  const [testAudioUrl, setTestAudioUrl] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  // Auth + saved voice fetch
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/signin'); return }
      setUserId(session.user.id)
      setAccessToken(session.access_token)
      setAuthLoading(false)

      const { data: profile } = await supabase
        .from('profiles')
        .select('voice_id, voice_name, has_voice_clone, voice_type')
        .eq('id', session.user.id)
        .single()

      if (profile?.voice_id) {
        setSavedVoice(profile)
        setSelectedVoiceId(profile.voice_id)
      }
    })
  }, [router])

  // Fetch voices
  useEffect(() => {
    if (authLoading) return
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const res = await fetch('/api/voices', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setVoices(data.voices ?? [])
      } else {
        const errText = await res.text()
        console.error('[voices] fetch failed:', res.status, errText)
      }
      setVoicesLoading(false)
    })
  }, [authLoading])

  function handlePreview(voice) {
    if (!voice.previewUrl) return
    if (playingVoiceId === voice.id) {
      audioRef.current?.pause()
      setPlayingVoiceId(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = voice.previewUrl
      audioRef.current.play().catch(() => {})
      setPlayingVoiceId(voice.id)
      audioRef.current.onended = () => setPlayingVoiceId(null)
    }
  }

  async function handleSelectVoice(voice) {
    setSelectedVoiceId(voice.id)
    setSavingVoice(true)
    try {
      await fetch('/api/save-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ voice_id: voice.id, voice_name: voice.name }),
      })
      setSavedVoice({ voice_id: voice.id, voice_name: voice.name, has_voice_clone: false, voice_type: 'library' })
      posthog?.capture('voice_selected', { voice_name: voice.name })
    } finally {
      setSavingVoice(false)
    }
  }

  // Recording
  const drawWaveform = useCallback(() => {
    if (!analyserRef.current) return
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(data)
    const step = Math.floor(data.length / 20)
    const heights = Array.from({ length: 20 }, (_, i) => {
      const val = data[i * step] ?? 0
      return Math.max(4, (val / 255) * 48)
    })
    setBarHeights(heights)
    animFrameRef.current = requestAnimationFrame(drawWaveform)
  }, [])

  async function startRecording() {
    posthog?.capture('voice_clone_started')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyserRef.current = analyser
    animFrameRef.current = requestAnimationFrame(drawWaveform)

    const recorder = new MediaRecorder(stream)
    const chunks = []
    recorder.ondataavailable = e => chunks.push(e.data)
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      setAudioBlob(blob)
      setAudioUrl(URL.createObjectURL(blob))
      cancelAnimationFrame(animFrameRef.current)
      setBarHeights(Array(20).fill(4))
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    setIsRecording(true)
    setCountdown(30)
    setAudioBlob(null)
    setAudioUrl(null)

    let secs = 30
    countdownRef.current = setInterval(() => {
      secs -= 1
      setCountdown(secs)
      if (secs <= 0) stopRecording(recorder, stream)
    }, 1000)
  }

  function stopRecording(recorder, stream) {
    clearInterval(countdownRef.current)
    if (recorder?.state !== 'inactive') recorder?.stop()
    stream?.getTracks().forEach(t => t.stop())
    setIsRecording(false)
  }

  function handleStopRecording() {
    clearInterval(countdownRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    setIsRecording(false)
  }

  function handleReRecord() {
    setAudioBlob(null)
    setAudioUrl(null)
    setCountdown(30)
  }

  function handleFileDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) acceptFile(file)
  }

  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (file) acceptFile(file)
    e.target.value = ''
  }

  function acceptFile(file) {
    if (file.size > 10 * 1024 * 1024) { alert('File exceeds 10MB limit.'); return }
    setUploadedFile(file)
    setUploadedUrl(URL.createObjectURL(file))
    setAudioBlob(file)
    setAudioUrl(URL.createObjectURL(file))
  }

  async function handleClone() {
    const blob = audioBlob
    if (!blob || !userId) return
    setCloning(true)
    setCloneError(null)
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'voice.webm')
      fd.append('name', cloneName || 'My Voice')
      const res = await fetch('/api/clone-voice', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Clone failed')
      setCloneSuccess(data.voice_id)
      setSavedVoice({ voice_id: data.voice_id, voice_name: cloneName || 'My Voice', has_voice_clone: true, voice_type: 'clone' })
      posthog?.capture('voice_clone_completed')
    } catch (err) {
      setCloneError(err.message)
    } finally {
      setCloning(false)
    }
  }

  async function handleSaveAndContinue() {
    if (!savedVoice) return
    await fetch('/api/save-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ voice_id: savedVoice.voice_id, voice_name: savedVoice.voice_name }),
    })
    const createState = sessionStorage.getItem('omnyra_create_state')
    if (createState) {
      try {
        const { template } = JSON.parse(createState)
        router.push(`/create?template=${template || 'ugc-ad'}`)
        return
      } catch {}
    }
    router.push('/create')
  }

  async function handleTestBar() {
    if (!savedVoice?.voice_id || isTesting) return
    setIsTesting(true)
    try {
      const res = await fetch('/api/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "Discover what your audience actually wants to see — before you even hit record.", voice_id: savedVoice.voice_id }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      new Audio(URL.createObjectURL(blob)).play()
    } catch {
    } finally {
      setIsTesting(false)
    }
  }

  async function handleTestVoice(voiceId) {
    const vid = voiceId || savedVoice?.voice_id
    if (!vid || !testText.trim()) return
    setTestingVoice(true)
    setTestAudioUrl(null)
    try {
      const res = await fetch('/api/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText, voice_id: vid }),
      })
      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      setTestAudioUrl(URL.createObjectURL(blob))
    } catch (err) {
      console.error(err)
    } finally {
      setTestingVoice(false)
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
        <AnimatedBackground />
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(207,164,47,0.2)', borderTopColor: '#CFA42F', animation: 'spin 1s linear infinite', position: 'relative', zIndex: 1 }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const activeAudioBlob = cloneTab === 'upload' ? uploadedFile : audioBlob
  const activeAudioUrl = cloneTab === 'upload' ? uploadedUrl : audioUrl

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', position: 'relative', color: '#E8DEFF' }}>
      <AnimatedBackground />
      <audio ref={audioRef} style={{ display: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '24px 24px 100px' }}>

        {/* Page title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'linear-gradient(105deg,#CFA42F,#F7D96B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 6 }}>
            Voice Studio
          </div>
          <p style={{ color: '#BBA8C8', fontSize: 14 }}>Your voice. Every generation.</p>
        </div>

        {/* Current voice status card */}
        {savedVoice && (
          <div style={{ background: 'rgba(207,164,47,0.08)', border: '1px solid rgba(207,164,47,0.4)', borderRadius: 16, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ color: '#CFA42F', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Current Voice</p>
              <p style={{ color: '#FFFFFF', fontWeight: 600, margin: 0 }}>
                {savedVoice.has_voice_clone ? '🎙️ Your Voice Clone' : `🔊 ${savedVoice.voice_name || 'Library Voice'}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={testText}
                onChange={e => setTestText(e.target.value)}
                placeholder="Type to hear your voice..."
                maxLength={150}
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(207,164,47,0.25)', borderRadius: 10, padding: '8px 14px', color: '#C084FC', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 260 }}
              />
              <button
                onClick={() => handleTestVoice(savedVoice.voice_id)}
                disabled={testingVoice}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: 'white', padding: '8px 16px', cursor: testingVoice ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 13, opacity: testingVoice ? 0.6 : 1 }}
              >
                {testingVoice ? '...' : '▶ Test'}
              </button>
            </div>
          </div>
        )}

        {testAudioUrl && (
          <audio controls src={testAudioUrl} style={{ width: '100%', marginBottom: 24, borderRadius: 10 }} />
        )}

        {/* ── SECTION 1: VOICE LIBRARY ─────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 20 }}>
            Choose a Voice
          </h2>

          {voicesLoading ? (
            <p style={{ color: '#BBA8C8', fontSize: 14 }}>Loading voices...</p>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedVoiceId || ''}
                onChange={e => {
                  const voice = voices.find(v => v.id === e.target.value)
                  if (voice) handleSelectVoice(voice)
                }}
                style={{
                  flex: 1,
                  minWidth: 200,
                  background: 'rgba(45,10,62,0.8)',
                  border: '1px solid rgba(201,168,76,0.4)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#E8DEFF',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select a voice...</option>
                {voices.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.gender ? ` · ${v.gender}` : ''}{v.accent ? ` · ${v.accent}` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const voice = voices.find(v => v.id === (selectedVoiceId || savedVoice?.voice_id))
                  if (voice) handlePreview(voice)
                }}
                disabled={!selectedVoiceId && !savedVoice?.voice_id}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 10,
                  color: 'white',
                  padding: '10px 18px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  opacity: (!selectedVoiceId && !savedVoice?.voice_id) ? 0.4 : 1,
                }}
              >
                {playingVoiceId ? '⏹ Stop' : '▶ Preview'}
              </button>
            </div>
          )}
        </section>

        {/* ── DIVIDER ──────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', margin: '40px 0', color: '#C9A84C', letterSpacing: '0.15em', fontSize: 14, fontWeight: 600 }}>
          ✦ OR CLONE YOUR OWN VOICE ✦
        </div>

        {/* ── SECTION 2: VOICE CLONE ───────────────────────────────────────── */}
        <section>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
            Clone Your Voice
          </h2>
          <p style={{ color: '#BBA8C8', fontSize: 13, marginBottom: 24 }}>
            30 seconds of clear speech is all it takes. Read naturally, no background noise.
          </p>

          {/* Clone name input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: '#8A7D92', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Name your voice clone
            </label>
            <input
              value={cloneName}
              onChange={e => setCloneName(e.target.value)}
              placeholder="e.g. My Studio Voice"
              style={{ background: '#0D0010', border: '1px solid rgba(204,171,175,0.25)', borderRadius: 12, padding: '11px 16px', color: '#C084FC', fontSize: 14, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[{ id: 'record', label: '🎙️ Record 30s' }, { id: 'upload', label: '📁 Upload File' }].map(t => (
              <button
                key={t.id}
                onClick={() => { setCloneTab(t.id); setAudioBlob(null); setAudioUrl(null); setUploadedFile(null); setUploadedUrl(null) }}
                style={{
                  padding: '9px 22px',
                  borderRadius: 9999,
                  border: cloneTab === t.id ? '1px solid rgba(207,164,47,0.65)' : '1px solid rgba(255,255,255,0.1)',
                  background: cloneTab === t.id ? 'rgba(207,164,47,0.1)' : 'rgba(255,255,255,0.04)',
                  color: cloneTab === t.id ? '#F0C040' : '#BBA8C8',
                  fontSize: 13,
                  fontWeight: cloneTab === t.id ? 700 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ background: 'rgba(75,30,130,0.4)', border: '1px solid rgba(207,164,47,0.15)', borderRadius: 20, padding: 32 }}>

            {/* ── RECORD TAB ─────────────────────────────────────────────── */}
            {cloneTab === 'record' && (
              <div style={{ textAlign: 'center' }}>

                {/* Waveform */}
                {isRecording && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 20, height: 56 }}>
                    {barHeights.map((h, i) => (
                      <div key={i} style={{ width: 4, height: h, background: '#CFA42F', borderRadius: 2, transition: 'height 0.08s ease' }} />
                    ))}
                  </div>
                )}

                {/* Record button */}
                {!audioUrl && (
                  <div>
                    <button
                      onClick={isRecording ? handleStopRecording : startRecording}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: isRecording ? '#EF4444' : 'rgba(239,68,68,0.8)',
                        border: isRecording ? '3px solid rgba(239,68,68,0.4)' : '3px solid rgba(239,68,68,0.3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 28,
                        margin: '0 auto 16px',
                        boxShadow: isRecording ? '0 0 0 12px rgba(239,68,68,0.15), 0 0 30px rgba(239,68,68,0.4)' : 'none',
                        animation: isRecording ? 'recordPulse 1.2s ease-in-out infinite' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      {isRecording ? '⏹' : '🎙️'}
                    </button>

                    {isRecording ? (
                      <div>
                        <p style={{ color: '#EF4444', fontWeight: 700, fontSize: 28, margin: '0 0 4px' }}>{countdown}s</p>
                        <p style={{ color: '#BBA8C8', fontSize: 13 }}>Recording... click to stop early</p>
                      </div>
                    ) : (
                      <p style={{ color: '#BBA8C8', fontSize: 14 }}>Click to start recording</p>
                    )}
                  </div>
                )}

                {/* Playback after recording */}
                {audioUrl && !isRecording && (
                  <div>
                    <p style={{ color: '#4ECB8C', fontWeight: 600, marginBottom: 12 }}>✓ Recording complete</p>
                    <audio controls src={audioUrl} style={{ width: '100%', marginBottom: 16, borderRadius: 10 }} />
                    <button
                      onClick={handleReRecord}
                      style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, color: '#BBA8C8', padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
                    >
                      Re-record
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── UPLOAD TAB ─────────────────────────────────────────────── */}
            {cloneTab === 'upload' && (
              <div>
                {!uploadedFile ? (
                  <div
                    onDrop={handleFileDrop}
                    onDragOver={e => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: '2px dashed rgba(201,168,76,0.45)', borderRadius: 12, padding: '48px 32px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🎵</div>
                    <p style={{ color: '#BBA8C8', fontWeight: 500, marginBottom: 6 }}>Drop your audio file here</p>
                    <p style={{ color: '#8A7D92', fontSize: 13 }}>MP3, WAV, M4A · Max 10MB</p>
                    <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,audio/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#4ECB8C', fontWeight: 600, marginBottom: 4 }}>✓ {uploadedFile.name}</p>
                    <p style={{ color: '#8A7D92', fontSize: 12, marginBottom: 16 }}>{(uploadedFile.size / 1024).toFixed(0)} KB</p>
                    <audio controls src={uploadedUrl} style={{ width: '100%', marginBottom: 16, borderRadius: 10 }} />
                    <button
                      onClick={() => { setUploadedFile(null); setUploadedUrl(null); setAudioBlob(null); setAudioUrl(null) }}
                      style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, color: '#BBA8C8', padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
                    >
                      Choose different file
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Clone button */}
            {!cloneSuccess && (
              <div style={{ marginTop: 28, textAlign: 'center' }}>
                <button
                  onClick={handleClone}
                  disabled={cloning || !activeAudioBlob}
                  className={(!cloning && activeAudioBlob) ? 'gold-btn' : undefined}
                  style={{
                    padding: '14px 48px',
                    borderRadius: 9999,
                    border: 'none',
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: (cloning || !activeAudioBlob) ? 'not-allowed' : 'pointer',
                    ...((cloning || !activeAudioBlob) && { background: 'rgba(255,255,255,0.06)', color: '#8A7D92' }),
                  }}
                >
                  {cloning ? 'Creating your voice clone...' : 'Clone My Voice →'}
                </button>
                {cloneError && (
                  <p style={{ color: '#F87171', fontSize: 13, marginTop: 12 }}>⚠ {cloneError}</p>
                )}
              </div>
            )}

            {/* Clone success */}
            {cloneSuccess && (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <p style={{ color: '#4ECB8C', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>✓ Voice clone ready</p>
                <p style={{ color: '#BBA8C8', fontSize: 13, marginBottom: 24 }}>"{cloneName || 'My Voice'}" is now your default voice for all generations.</p>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={testText}
                    onChange={e => setTestText(e.target.value)}
                    placeholder="Type something to hear your clone..."
                    maxLength={150}
                    style={{ background: '#0D0010', border: '1px solid rgba(204,171,175,0.25)', borderRadius: 10, padding: '10px 14px', color: '#C084FC', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 300 }}
                  />
                  <button
                    onClick={() => handleTestVoice(cloneSuccess)}
                    disabled={testingVoice}
                    className={!testingVoice ? 'gold-btn' : undefined}
                    style={{ padding: '10px 24px', borderRadius: 9, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: testingVoice ? 'wait' : 'pointer', ...(testingVoice && { background: 'rgba(255,255,255,0.06)', color: '#8A7D92' }) }}
                  >
                    {testingVoice ? '...' : '▶ Play Sample'}
                  </button>
                </div>

                {testAudioUrl && (
                  <audio controls src={testAudioUrl} style={{ width: '100%', marginTop: 16, borderRadius: 10 }} />
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {savedVoice && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(25,5,45,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(201,168,76,0.4)', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: '#C9A84C', fontWeight: 700, margin: 0 }}>✓ {savedVoice.has_voice_clone ? 'Your Voice Clone' : savedVoice.voice_name} selected</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>This voice will be used for all your generations</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleTestBar}
              disabled={isTesting}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, color: isTesting ? '#8A7D92' : 'white', padding: '10px 20px', cursor: isTesting ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500 }}
            >
              {isTesting ? '...' : '▶ Test Voice'}
            </button>
            <button
              onClick={handleSaveAndContinue}
              className="gold-btn"
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Save & Continue →
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
        @keyframes recordPulse { 0%, 100% { box-shadow: 0 0 0 8px rgba(239,68,68,0.15), 0 0 30px rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 18px rgba(239,68,68,0.05), 0 0 40px rgba(239,68,68,0.5); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}
