'use client'

import { useEffect, useState } from 'react'
import styles from './Lobby.module.css'

const inviteText = (url: string) => `🎴 Bora jogar Bridou? Senta na mesa comigo: ${url}`

/**
 * One-tap invites: the code as card tiles (tap to copy), copy-link,
 * WhatsApp with a prefilled message, and the native share sheet on mobile.
 */
export function InvitePanel({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setShareUrl(`${window.location.origin}/mesa/${code}`)
    setCanNativeShare(typeof navigator.share === 'function')
  }, [code])

  const copyLink = async () => {
    const text = inviteText(shareUrl)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Older browsers / non-secure LAN origins: legacy path
      const scratch = document.createElement('textarea')
      scratch.value = text
      scratch.style.position = 'fixed'
      scratch.style.opacity = '0'
      document.body.appendChild(scratch)
      scratch.select()
      const ok = document.execCommand('copy')
      scratch.remove()
      if (!ok) {
        setError('Não foi possível copiar — selecione o link abaixo')
        return
      }
    }
    setError('')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const nativeShare = () => {
    navigator
      .share({ title: 'Bridou', text: inviteText(shareUrl), url: shareUrl })
      .catch(() => {}) // user closed the sheet
  }

  return (
    <div className={styles.invite}>
      <span className={styles.inviteLabel}>chame os amigos — código da mesa</span>
      <div className={styles.codeTiles} onClick={copyLink} role="button" title="Copiar convite">
        {code.split('').map((char, i) => (
          <span key={i} className={styles.codeTile}>
            {char}
          </span>
        ))}
      </div>
      <div className={styles.inviteButtons}>
        <button className={styles.inviteButton} onClick={copyLink}>
          {copied ? '✓ copiado!' : '🔗 Copiar link'}
        </button>
        <a
          className={`${styles.inviteButton} ${styles.whatsapp}`}
          href={`https://wa.me/?text=${encodeURIComponent(inviteText(shareUrl))}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
        {canNativeShare && (
          <button className={styles.inviteButton} onClick={nativeShare}>
            Compartilhar
          </button>
        )}
      </div>
      <span className={styles.inviteUrl}>{shareUrl}</span>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
