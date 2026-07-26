'use client'

import type { MesaSummary } from '@bridou/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { ApiError, api } from '@/lib/api'
import styles from './Mesas.module.css'

/**
 * The mesas home: the groups you belong to, plus the two ways in — start one
 * or type a friend's code. This is the screen that replaces "text the group
 * chat and hope", so it leads with who's around right now.
 */
export function MesasClient() {
  const router = useRouter()
  const { user, loading: authLoading, signIn } = useAuth()
  const [mesas, setMesas] = useState<MesaSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    setLoading(true)
    api
      .myMesas()
      .then(({ mesas }) => setMesas(mesas))
      .catch(() => setError('Não deu pra carregar suas mesas.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!user) {
      setMesas([])
      setLoading(false)
      return
    }
    refresh()
    // Members drift on and off; a slow poll keeps "quem tá on" honest.
    const timer = setInterval(refresh, 45_000)
    return () => clearInterval(timer)
  }, [user])

  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const { mesa } = await api.createMesa(name.trim())
      router.push(`/mesas/${mesa.code}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra criar a mesa.')
      setBusy(false)
    }
  }

  const join = async () => {
    const code = joinCode.trim().toUpperCase()
    if (!code || busy) return
    setBusy(true)
    setError('')
    try {
      await api.joinMesa(code)
      router.push(`/mesas/${code}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não achamos essa mesa.')
      setBusy(false)
    }
  }

  if (authLoading) return <p className={styles.muted}>Carregando…</p>

  if (!user) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.title}>Suas mesas</h1>
        <p className={styles.muted}>
          Uma mesa é o seu grupo fixo: código que não expira, temporada rolando e a
          classificação de sempre.
        </p>
        <button className="btn" onClick={signIn}>
          Entrar com Google
        </button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Suas mesas</h1>
        <button className="btn small" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancelar' : 'Nova mesa'}
        </button>
      </header>

      {creating && (
        <div className={styles.panel}>
          <label className={styles.label} htmlFor="mesa-name">
            Nome da mesa
          </label>
          <input
            id="mesa-name"
            className={styles.input}
            value={name}
            maxLength={40}
            placeholder="Mesa dos Cunhados"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="btn" onClick={create} disabled={busy || !name.trim()}>
            Criar mesa
          </button>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.muted}>Carregando…</p>}

      {!loading && mesas.length === 0 && (
        <p className={styles.muted}>
          Você ainda não tem mesa. Crie uma e mande o código pro pessoal.
        </p>
      )}

      <ul className={styles.list}>
        {mesas.map((mesa) => (
          <li key={mesa.id}>
            <button className={styles.card} onClick={() => router.push(`/mesas/${mesa.code}`)}>
              <span className={styles.cardMain}>
                <strong className={styles.cardName}>{mesa.name}</strong>
                <span className={styles.cardMeta}>
                  {mesa.memberCount} {mesa.memberCount === 1 ? 'membro' : 'membros'} ·{' '}
                  {mesa.code}
                </span>
              </span>
              {mesa.onlineCount > 0 && (
                <span className={styles.online}>
                  <span className={styles.onlineDot} aria-hidden />
                  {mesa.onlineCount} on
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.panel}>
        <label className={styles.label} htmlFor="join-code">
          Entrar numa mesa
        </label>
        <div className={styles.joinRow}>
          <input
            id="join-code"
            className={`${styles.input} ${styles.codeInput}`}
            value={joinCode}
            maxLength={5}
            placeholder="CÓDIGO"
            autoCapitalize="characters"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <button className="btn" onClick={join} disabled={busy || joinCode.length < 5}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  )
}
