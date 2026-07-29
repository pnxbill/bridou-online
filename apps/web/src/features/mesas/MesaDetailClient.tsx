'use client'

import type { MesaDetail } from '@bridou/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Skeleton, SkeletonRows } from '@/components/Loading'
import { useAuth } from '@/features/auth/AuthProvider'
import { ApiError, api } from '@/lib/api'
import styles from './Mesas.module.css'

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

/** "acaba em 12 dias" — the pressure that gets one more game played this week. */
const seasonCountdown = (endsAt: string): string => {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return 'encerrando'
  const days = Math.ceil(ms / 86_400_000)
  if (days === 1) return 'acaba amanhã'
  if (days <= 14) return `acaba em ${days} dias`
  return `acaba em ${Math.ceil(days / 7)} semanas`
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export function MesaDetailClient({ code }: { code: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const [detail, setDetail] = useState<MesaDetail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = () => {
    api
      .mesa(code)
      .then(({ mesa }) => setDetail(mesa))
      .catch(() => setError('Mesa não encontrada.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30_000)
    return () => clearInterval(timer)
  }, [code])

  const isMember = !!user && !!detail?.members.some((m) => m.id === user.id)

  const openTable = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { lobby } = await api.openMesaTable(code)
      router.push(`/mesa/${lobby.code}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra abrir a mesa.')
      setBusy(false)
    }
  }

  const join = async () => {
    setBusy(true)
    try {
      await api.joinMesa(code)
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra entrar.')
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    const url = `${window.location.origin}/mesas/${code}`
    const text = `Bora jogar Bridou? Entra na mesa ${detail?.mesa.name ?? ''} com o código ${code}: ${url}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Bridou', text, url })
        return
      } catch {
        // dismissed — fall through
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não deu pra copiar o convite.')
    }
  }

  if (loading) return <MesaDetailSkeleton />
  if (!detail) return <p className={styles.error}>{error || 'Mesa não encontrada.'}</p>

  const online = detail.members.filter((m) => m.online)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{detail.mesa.name}</h1>
          <p className={styles.cardMeta}>
            código <strong className={styles.code}>{detail.mesa.code}</strong>
          </p>
        </div>
        <button className="btn small" onClick={share}>
          {copied ? 'Copiado!' : 'Convidar'}
        </button>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {detail.season && (
        <div className={styles.season}>
          <div>
            <strong>{detail.season.name}</strong>
            <span className={styles.cardMeta}> · {seasonCountdown(detail.season.endsAt)}</span>
          </div>
          {isMember ? (
            <button className="btn" onClick={openTable} disabled={busy}>
              Abrir a mesa
            </button>
          ) : (
            user && (
              <button className="btn" onClick={join} disabled={busy}>
                Entrar na mesa
              </button>
            )
          )}
        </div>
      )}

      {/* Who's around right now — the reason this page exists. */}
      <section className={styles.section}>
        <h2 className={styles.subtitle}>
          Quem tá on{online.length > 0 && ` · ${online.length}`}
        </h2>
        <ul className={styles.members}>
          {detail.members.map((member) => (
            <li key={member.id} className={styles.member} data-online={member.online ? '' : undefined}>
              {member.photoURL ? (
                <img className={styles.avatar} src={member.photoURL} alt="" />
              ) : (
                <span className={styles.avatarFallback} aria-hidden>
                  {initials(member.name)}
                </span>
              )}
              <span className={styles.memberName}>{member.name}</span>
              {member.online && <span className={styles.onlineDot} aria-label="online" />}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subtitle}>Classificação</h2>
        {detail.standings.length === 0 ? (
          <p className={styles.muted}>Nenhuma partida nesta temporada ainda.</p>
        ) : (
          <ol className={styles.standings}>
            {detail.standings.map((row) => (
              <li
                key={row.id}
                className={styles.standing}
                data-me={user?.id === row.id ? '' : undefined}
                data-first={row.position === 1 ? '' : undefined}
              >
                <span className={styles.position}>{row.position}</span>
                {row.photoURL ? (
                  <img className={styles.avatar} src={row.photoURL} alt="" />
                ) : (
                  <span className={styles.avatarFallback} aria-hidden>
                    {initials(row.name)}
                  </span>
                )}
                <span className={styles.standingName}>{row.name}</span>
                <span className={styles.standingStats}>
                  {row.gamesPlayed}J · {row.wins}V
                </span>
                <strong className={styles.standingPoints}>{row.points}</strong>
              </li>
            ))}
          </ol>
        )}
      </section>

      {detail.recentGames.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.subtitle}>Últimas partidas</h2>
          <ul className={styles.games}>
            {detail.recentGames.map((game) => (
              <li key={game.gameId}>
                <button
                  className={styles.gameRow}
                  onClick={() => router.push(`/resenha/${game.gameId}`)}
                >
                  <span className={styles.gameDate}>{formatDate(game.playedAt)}</span>
                  <span className={styles.gameChampion}>
                    👑 {game.championName}
                    <span className={styles.cardMeta}> · {game.championPoints} pts</span>
                  </span>
                  <span className={styles.cardMeta}>{game.playerCount}p</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.pastSeasons.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.subtitle}>Sala de troféus</h2>
          <ul className={styles.trophies}>
            {detail.pastSeasons.map((season) => {
              const champion = detail.members.find((m) => m.id === season.championId)
              return (
                <li key={season.id} className={styles.trophy}>
                  <span aria-hidden>🏆</span>
                  <span>
                    <strong>{season.name}</strong>
                    <span className={styles.cardMeta}> · {champion?.name ?? 'sem campeão'}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

/** The page's own outline while the fetch is in flight — name over code, the
 *  season strip, the member chips, the standings. Same boxes in the same
 *  places, so the content drops in without the page rearranging itself. */
function MesaDetailSkeleton() {
  return (
    <div className={styles.page} aria-busy>
      <div className={styles.skeletonHead}>
        <Skeleton width="55%" height="1.5rem" />
        <Skeleton width="30%" height="0.8rem" />
      </div>
      <Skeleton className={styles.skeletonSeason} />
      <div className={styles.section}>
        <h2 className={styles.subtitle}>Quem tá on</h2>
        <div className={styles.skeletonChips}>
          {['7rem', '9rem', '6rem', '8rem'].map((w) => (
            <Skeleton key={w} className={styles.skeletonChip} width={w} />
          ))}
        </div>
      </div>
      <div className={styles.section}>
        <h2 className={styles.subtitle}>Classificação</h2>
        <SkeletonRows count={4} face trailing label="Carregando a mesa…" />
      </div>
    </div>
  )
}
