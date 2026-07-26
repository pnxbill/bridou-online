'use client'

import {
  ACHIEVEMENTS,
  TIER_ORDER,
  type AchievementDef,
  type AchievementTier,
} from '@bridou/shared'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { api, type PlayerProfile } from '@/lib/api'
import styles from './Conquistas.module.css'

const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  lenda: 'Lenda',
}

/** Rarest first — the shelf should open on the things worth bragging about. */
const byTierDesc = (a: AchievementDef, b: AchievementDef) =>
  TIER_ORDER[b.tier] - TIER_ORDER[a.tier] || a.name.localeCompare(b.name)

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

export function ConquistasClient() {
  const { user, loading: authLoading, signIn } = useAuth()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .myProfile()
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch(() => {
        if (!cancelled) setError('Não deu pra carregar suas conquistas.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const unlockedById = useMemo(
    () => new Map((profile?.unlocked ?? []).map((u) => [u.achievementId, u])),
    [profile],
  )

  // Secrets stay hidden until earned, so the shelf has some mystery in it.
  const visible = useMemo(
    () => ACHIEVEMENTS.filter((a) => !a.secret || unlockedById.has(a.id)).sort(byTierDesc),
    [unlockedById],
  )

  if (authLoading) return <p className={styles.muted}>Carregando…</p>

  if (!user) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.title}>Conquistas</h1>
        <p className={styles.muted}>Entre pra ver o que você já desbloqueou.</p>
        <button className="btn" onClick={signIn}>
          Entrar com Google
        </button>
      </div>
    )
  }

  const stats = profile?.stats
  const unlockedCount = unlockedById.size

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Conquistas</h1>
        <p className={styles.count}>
          <strong>{unlockedCount}</strong> de {ACHIEVEMENTS.length}
        </p>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuenow={unlockedCount}
          aria-valuemin={0}
          aria-valuemax={ACHIEVEMENTS.length}
        >
          <span style={{ width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%` }} />
        </div>
      </header>

      {stats && (
        <section className={styles.stats}>
          <Stat label="Partidas" value={stats.gamesPlayed} />
          <Stat label="Vitórias" value={stats.wins} />
          <Stat label="Sequência" value={stats.currentWinStreak} />
          <Stat label="Mesas abertas" value={stats.hosted} />
          <Stat label="Bailadas" value={stats.bailadas} />
        </section>
      )}

      {profile && profile.headToHead.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.subtitle}>Confrontos</h2>
          <ul className={styles.h2h}>
            {profile.headToHead.slice(0, 8).map((row) => (
              <li key={row.opponentId} className={styles.h2hRow}>
                <span className={styles.h2hName}>{row.opponentName}</span>
                <span className={styles.h2hScore}>
                  <strong data-lead={row.wins > row.losses ? '' : undefined}>{row.wins}</strong>
                  <span className={styles.h2hDash}>–</span>
                  <strong data-lead={row.losses > row.wins ? '' : undefined}>{row.losses}</strong>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.muted}>Carregando conquistas…</p>}

      <ul className={styles.grid}>
        {visible.map((def) => {
          const unlock = unlockedById.get(def.id)
          return (
            <li
              key={def.id}
              className={styles.card}
              data-tier={def.tier}
              data-locked={unlock ? undefined : ''}
              data-roast={def.roast ? '' : undefined}
            >
              <span className={styles.icon} aria-hidden>
                {unlock ? def.icon : '🔒'}
              </span>
              <div className={styles.cardBody}>
                <strong className={styles.cardName}>{def.name}</strong>
                <p className={styles.cardDesc}>{def.description}</p>
                <span className={styles.tier}>
                  {TIER_LABEL[def.tier]}
                  {unlock && ` · ${formatDate(unlock.unlockedAt)}`}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
