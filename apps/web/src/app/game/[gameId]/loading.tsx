import { Loading } from '@/components/Loading'

/** The table is full-bleed: there is no column to wait in, so the deck is cut
 *  over the night sky until the felt is ready. */
export default function GameLoading() {
  return <Loading variant="screen" label="entrando na mesa" />
}
