'use client'

import { BASEADO_FREE_TRAGADAS, isCachimbo } from '@bridou/shared'
import { motion } from 'framer-motion'
import styles from './Baseado.module.css'

interface Props {
  /** Tragadas the holder has taken this round — drives the burn and the tally. */
  tragadas: number
  /** Shared layout id so it *flies* between seats instead of teleporting. */
  layoutId?: string
  className?: string
}

/**
 * The lit baseado, drawn where it currently is.
 *
 * It only ever reports — passing it lives in the dock, which is the one place
 * an in-game control may be, and a tap target this small next to the played
 * cards would be a misplay waiting to happen.
 *
 * The `layoutId` is what sells the mechanic: framer-motion measures the old
 * and new seat and animates between them, so a pass reads as the thing going
 * round the table rather than a badge blinking off one avatar and onto another.
 */
export function Baseado({ tragadas, layoutId, className }: Props) {
  const hot = isCachimbo(tragadas)
  // burn to the stub over the free tragadas, then hold — a roach still burns
  const burned = Math.min(tragadas, BASEADO_FREE_TRAGADAS) / BASEADO_FREE_TRAGADAS

  return (
    <motion.span
      {...(layoutId ? { layoutId } : {})}
      className={`${styles.root} ${className ?? ''}`}
      data-hot={hot ? '' : undefined}
      style={{ '--burned': burned } as React.CSSProperties}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      aria-label={
        tragadas > 0
          ? `baseado, ${tragadas} ${tragadas === 1 ? 'tragada' : 'tragadas'}`
          : 'baseado'
      }
    >
      {tragadas > 0 && <span className={styles.count}>{tragadas}</span>}
      {/* the mouth end paints over the paper, so it stays visible as it burns */}
      <span className={styles.stick} />
      <span className={styles.tip} />
      <span className={styles.ember} />
      <span className={styles.smoke} />
      <span className={styles.smoke} />
      <span className={styles.smoke} />
    </motion.span>
  )
}
