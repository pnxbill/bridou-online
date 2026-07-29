import { AppNav } from '@/components/AppNav'
import { HomeClient } from '@/features/home/HomeClient'

/** The entrance owns the whole viewport — outside the (main) group on purpose,
 *  so nothing sits over the wordmark and the fan. It carries the bottom bar
 *  (which is also where your face lives now), and nothing else: the top-left
 *  corner goes back to the design. */
export default function HomePage() {
  return (
    <>
      <HomeClient />
      <AppNav />
    </>
  )
}
