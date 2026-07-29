import { Loading } from '@/components/Loading'

/** Shown while a `(main)` route segment streams in. The header and the bottom
 *  bar stay put — only the column waits, which is exactly what's missing. */
export default function MainLoading() {
  return <Loading />
}
