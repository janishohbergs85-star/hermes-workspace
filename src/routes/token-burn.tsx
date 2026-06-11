import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { TokenBurnScreen } from '@/screens/token-burn/token-burn-screen'

export const Route = createFileRoute('/token-burn')({
  ssr: false,
  component: TokenBurnRoute,
})

function TokenBurnRoute() {
  usePageTitle('Token Burn')
  return <TokenBurnScreen />
}
