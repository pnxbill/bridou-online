import { AppHeader } from '@/components/AppHeader'
import { HomeClient } from '@/features/home/HomeClient'

/** The entrance owns the whole viewport — outside the (main) group on
 *  purpose, so the header shows up as the floating menu button instead of a
 *  bar sitting over the wordmark. */
export default function HomePage() {
  return (
    <>
      <AppHeader variant="floating" />
      <HomeClient />
    </>
  )
}
