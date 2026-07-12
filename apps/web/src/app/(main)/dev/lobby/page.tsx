'use client'

import { InvitePanel } from '@/features/lobby/InvitePanel'
import styles from '@/features/lobby/Lobby.module.css'

/** Design fixture: the invite panel as a seated leader sees it. */
export default function DevLobbyPage() {
  return (
    <div className={styles.lobby}>
      <h1 className={styles.title}>Mesa RH6TC</h1>
      <p className={styles.subtitle}>fixture — painel de convite</p>
      <InvitePanel code="RH6TC" />
      <div className={styles.actions}>
        <button className={styles.action}>Adicionar bot 🤖</button>
        <button className={`${styles.action} ${styles.actionPrimary}`}>COMEÇAR</button>
        <button className={styles.actionQuiet}>levantar da mesa</button>
      </div>
      <p className={styles.waiting}>chame mais alguém ou adicione um bot…</p>
    </div>
  )
}
