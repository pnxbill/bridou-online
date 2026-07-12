import { HomeClient } from '@/features/home/HomeClient'

/** Header-free entrance — outside the (main) route group on purpose. */
export default function HomePage() {
  return <HomeClient />
}
