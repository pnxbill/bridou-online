'use client'

import { BASEADO_FREE_TRAGADAS, BASEADO_PASS_COOLDOWN_MS, isCachimbo } from '@bridou/shared'
import { useEffect, useRef, useState } from 'react'
import { playBaseadoPassSound } from '../sounds'
import { Baseado } from './Baseado'
import styles from './BaseadoButton.module.css'

interface Props {
  tragadas: number
  onPass: () => void
}

/**
 * "Passa aí" — the one thing you do with the baseado.
 *
 * Only rendered while you're the one holding it, which makes its appearance
 * the notification: nothing announces that the blunt reached you except this
 * button showing up in the thumb zone. The line under it is the running
 * account — what the tragadas are worth if you land your bet, and the warning
 * once they start costing instead.
 *
 * The cooldown is mirrored here purely so the button can look spent; the
 * server is the one that enforces it.
 */
export function BaseadoButton({ tragadas, onPass }: Props) {
  const [cooling, setCooling] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const hot = isCachimbo(tragadas)
  const left = BASEADO_FREE_TRAGADAS - tragadas

  const pass = () => {
    if (cooling) return
    setCooling(true)
    playBaseadoPassSound()
    onPass()
    timer.current = setTimeout(() => setCooling(false), BASEADO_PASS_COOLDOWN_MS)
  }

  return (
    <button
      type="button"
      className={styles.button}
      data-hot={hot ? '' : undefined}
      disabled={cooling}
      onClick={pass}
      aria-label="Passar o baseado para o próximo"
    >
      <span className={styles.icon}>
        <Baseado tragadas={tragadas} />
      </span>
      <span className={styles.label}>
        passa aí
        <span className={styles.hint}>
          {hot
            ? `virou cachimbo · −${tragadas - BASEADO_FREE_TRAGADAS}`
            : tragadas === 0
              ? 'vale +1 por vaza'
              : `+${tragadas} se acertar · ${left === 0 ? 'último' : `mais ${left}`}`}
        </span>
      </span>
    </button>
  )
}
