'use client'

/**
 * Design fixture for every wait in the app — the real components from
 * `components/Loading`, side by side, so the mark and the skeletons can be
 * tuned without throttling a network tab.
 *
 * The 220ms appear delay is real here too: reload and nothing shows for a beat.
 */
import { useState } from 'react'
import { Loading, ShuffleMark, Skeleton, SkeletonRows, SkeletonTiles } from '@/components/Loading'
import styles from './fixture.module.css'

const SECTIONS = ['a marca', 'listas', 'grade', 'tela cheia'] as const
type Section = (typeof SECTIONS)[number]

export default function DevLoadingPage() {
  const [section, setSection] = useState<Section>('a marca')
  const [screen, setScreen] = useState(false)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Estados de carregamento</h1>
        <p className={styles.lede}>
          Sabendo a forma do que vem, desenhe a forma (skeleton). Sem saber, corte o baralho.
        </p>
        <div className={styles.tabs}>
          {SECTIONS.map((s) => (
            <button
              key={s}
              className={styles.tab}
              data-active={s === section ? '' : undefined}
              onClick={() => (s === 'tela cheia' ? setScreen(true) : setSection(s))}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {section === 'a marca' && (
        <section className={styles.section}>
          <h2 className={styles.subtitle}>o baralho sendo cortado</h2>
          <div className={styles.marks}>
            <div className={styles.markCell}>
              <ShuffleMark />
              <span className={styles.caption}>md — telas</span>
            </div>
            <div className={styles.markCell}>
              <ShuffleMark size="sm" />
              <span className={styles.caption}>sm — botões, chips</span>
            </div>
          </div>

          <h2 className={styles.subtitle}>com legenda</h2>
          <div className={styles.frame}>
            <Loading label="entrando na mesa" />
          </div>
          <div className={styles.frame}>
            <Loading />
          </div>
        </section>
      )}

      {section === 'listas' && (
        <section className={styles.section}>
          <h2 className={styles.subtitle}>suas mesas</h2>
          <SkeletonRows count={3} trailing />

          <h2 className={styles.subtitle}>classificação (com rosto)</h2>
          <SkeletonRows count={4} face trailing />

          <h2 className={styles.subtitle}>blocos soltos</h2>
          <div className={styles.loose}>
            <Skeleton width="55%" height="1.5rem" />
            <Skeleton width="30%" height="0.8rem" />
            <Skeleton height="3.4rem" radius="12px" />
          </div>
        </section>
      )}

      {section === 'grade' && (
        <section className={styles.section}>
          <h2 className={styles.subtitle}>conquistas</h2>
          <SkeletonTiles count={8} />
        </section>
      )}

      {screen && (
        <div className={styles.screenDemo} onClick={() => setScreen(false)}>
          <Loading variant="screen" label="preparando a mão de hoje" />
          <span className={styles.dismiss}>toque para fechar</span>
        </div>
      )}
    </div>
  )
}
