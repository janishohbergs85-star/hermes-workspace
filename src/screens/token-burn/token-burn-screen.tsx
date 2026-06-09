import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import type { DashboardOverview } from '@/server/dashboard-aggregator'
import { openHamburgerMenu } from '@/components/mobile-hamburger-menu'

// ── Token Burn dashboard ─────────────────────────────────────────
//
// Inspired by Nate B. Jones' "token burn dashboard" (natesnewsletter
// .substack.com/p/token-burn-dashboard). His core point: you can't
// trust one token number across your tools — Codex, Claude and
// ChatGPT each count differently — so the dashboard ships in several
// *variants*, one lens per tool/provider plus a reconciled combined
// view. Each variant is paired with five rules for reading the chart
// and a 15-minute weekly review that turns usage into a learning loop.
//
// We derive every number from the existing dashboard aggregator
// (`/api/dashboard/overview`) so this stays zero-backend-change. The
// per-tool variants are reconstructed from `analytics.topModels[]`
// (the only per-model breakdown the aggregator exposes); the
// input/output/cache/reasoning split and the daily series only exist
// combined, so for a single-tool variant we scale them by that tool's
// token share and label them as modeled — honest about the limits.

type AnalyticsSection = NonNullable<DashboardOverview['analytics']>
type Period = 7 | 14 | 30

// ── Formatting helpers ───────────────────────────────────────────

function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

function readPalette() {
  return {
    accent: themeColor('--theme-accent', '#6366f1'),
    accentSecondary: themeColor('--theme-accent-secondary', '#8b5cf6'),
    success: themeColor('--theme-success', '#22c55e'),
    warning: themeColor('--theme-warning', '#f59e0b'),
    danger: themeColor('--theme-danger', '#ef4444'),
    muted: themeColor('--theme-muted', '#6b7280'),
    border: themeColor('--theme-border', '#333333'),
    card: themeColor('--theme-card', '#1a1a2e'),
    text: themeColor('--theme-text', '#e5e7eb'),
  }
}

function usePalette() {
  const [palette, setPalette] = useState(readPalette)
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const refresh = () => setPalette(readPalette())
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
    })
    return () => observer.disconnect()
  }, [])
  return palette
}

// ── Tool / provider classification ───────────────────────────────
//
// Nate frames the variants around tools (Codex / Claude / ChatGPT).
// From a raw model id we can only resolve the provider family, so we
// map families to the friendly tool label the operator recognises.

type FamilyKey =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'local'
  | 'other'

const FAMILY_LABELS: Record<FamilyKey, string> = {
  anthropic: 'Claude',
  openai: 'Codex / ChatGPT',
  google: 'Gemini',
  xai: 'Grok',
  local: 'Local',
  other: 'Other',
}

function classifyFamily(modelId: string): FamilyKey {
  const id = modelId.toLowerCase()
  if (id.startsWith('claude') || id.includes('anthropic')) return 'anthropic'
  if (
    id.startsWith('gpt') ||
    id.startsWith('o1') ||
    id.startsWith('o3') ||
    id.startsWith('o4') ||
    id.includes('codex') ||
    id.includes('openai')
  )
    return 'openai'
  if (id.includes('gemini') || id.includes('google')) return 'google'
  if (id.includes('grok') || id.includes('xai')) return 'xai'
  if (
    id.startsWith('gemma') ||
    id.startsWith('llama') ||
    id.startsWith('qwen') ||
    id.startsWith('mistral') ||
    id.startsWith('mixtral') ||
    id.startsWith('deepseek') ||
    id.startsWith('phi')
  )
    return 'local'
  return 'other'
}

// A resolved variant — either the reconciled combined view or one
// single-tool lens.
type Variant = {
  id: string // 'combined' | family key
  label: string
  family: FamilyKey | null // null = combined
  tokens: number
  sessions: number
  calls: number
  cost: number
  share: number // 0..1 of total tokens
  models: Array<{ id: string; tokens: number; calls: number }>
}

// ── Variant derivation ───────────────────────────────────────────

function deriveVariants(analytics: AnalyticsSection | null): Array<Variant> {
  if (!analytics || analytics.source !== 'analytics') return []

  const total = analytics.totalTokens || 0
  const combined: Variant = {
    id: 'combined',
    label: 'Combined',
    family: null,
    tokens: total,
    sessions: analytics.totalSessions,
    calls: analytics.totalApiCalls,
    cost: analytics.estimatedCostUsd ?? 0,
    share: 1,
    models: analytics.topModels.map((m) => ({
      id: m.id,
      tokens: m.tokens,
      calls: m.calls,
    })),
  }

  const map = new Map<FamilyKey, Variant>()
  for (const m of analytics.topModels) {
    const family = classifyFamily(m.id)
    const existing = map.get(family)
    if (existing) {
      existing.tokens += m.tokens
      existing.calls += m.calls
      existing.sessions += m.sessions
      existing.cost += m.cost
      existing.models.push({ id: m.id, tokens: m.tokens, calls: m.calls })
    } else {
      map.set(family, {
        id: family,
        label: FAMILY_LABELS[family],
        family,
        tokens: m.tokens,
        sessions: m.sessions,
        calls: m.calls,
        cost: m.cost,
        share: 0,
        models: [{ id: m.id, tokens: m.tokens, calls: m.calls }],
      })
    }
  }

  const families = Array.from(map.values())
    .map((v) => ({
      ...v,
      share: total > 0 ? v.tokens / total : 0,
      models: v.models.sort((a, b) => b.tokens - a.tokens),
    }))
    .sort((a, b) => b.tokens - a.tokens)

  return [combined, ...families]
}

// ── Small UI atoms ───────────────────────────────────────────────

function Card({
  title,
  titleRight,
  accentColor,
  className,
  children,
}: {
  title?: string
  titleRight?: ReactNode
  accentColor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border ${className ?? ''}`}
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {accentColor && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}50, transparent)`,
          }}
        />
      )}
      {title && (
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            {title}
          </h3>
          {titleRight}
        </div>
      )}
      <div className="flex-1 px-5 pb-4 pt-3">{children}</div>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  accentColor,
}: {
  label: string
  value: string
  sub?: string
  accentColor: string
}) {
  return (
    <Card accentColor={accentColor}>
      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
          {label}
        </div>
        <div className="font-mono text-2xl font-bold tabular-nums text-ink">
          {value}
        </div>
        {sub && <div className="text-[11px] text-muted">{sub}</div>}
      </div>
    </Card>
  )
}

const COST_LABEL_COPY: Record<AnalyticsSection['costLabel'], string> = {
  precise: 'every session priced',
  partial: 'some sessions included / unpriced',
  included: 'subscription-included (≈ $0)',
  unknown: 'no cost signal',
}

// ── Token mix bar ────────────────────────────────────────────────

function TokenMix({
  analytics,
  scale,
  modeled,
}: {
  analytics: AnalyticsSection
  scale: number
  modeled: boolean
}) {
  const slices = [
    {
      label: 'cache',
      value: analytics.cacheReadTokens * scale,
      tone: 'var(--theme-accent-secondary)',
    },
    {
      label: 'input',
      value: analytics.inputTokens * scale,
      tone: 'var(--theme-accent)',
    },
    {
      label: 'output',
      value: analytics.outputTokens * scale,
      tone: 'var(--theme-success)',
    },
    {
      label: 'reasoning',
      value: analytics.reasoningTokens * scale,
      tone: 'var(--theme-warning)',
    },
  ]
  const total = slices.reduce((a, s) => a + s.value, 0)
  if (total <= 0) return null

  return (
    <Card
      title="Token mix"
      titleRight={
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted"
          title={
            modeled
              ? 'Input / output / cache / reasoning split is only reported combined; shown scaled to this tool’s token share.'
              : 'Input / output / cache / reasoning split across the window.'
          }
        >
          {modeled ? 'modeled · share' : `${analytics.windowDays}d`}
        </span>
      }
    >
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full"
        style={{
          background: 'color-mix(in srgb, var(--theme-border) 40%, transparent)',
        }}
      >
        {slices.map((s) => {
          const pct = (s.value / total) * 100
          if (pct < 0.5) return null
          return (
            <div
              key={s.label}
              style={{ width: `${pct}%`, background: s.tone }}
              title={`${s.label}: ${formatTokens(s.value)} (${pct.toFixed(1)}%)`}
            />
          )
        })}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
        {slices.map((s) => {
          const pct = (s.value / total) * 100
          return (
            <li
              key={s.label}
              className="flex items-center justify-between gap-2 text-muted"
            >
              <span className="flex items-center gap-1.5 truncate">
                <span
                  aria-hidden
                  className="inline-block size-1.5 shrink-0 rounded-full"
                  style={{ background: s.tone }}
                />
                <span className="font-mono uppercase tracking-[0.1em]">
                  {s.label}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-ink">
                {formatTokens(s.value)}
                <span className="ml-1 text-muted">· {pct.toFixed(0)}%</span>
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ── Daily burn chart ─────────────────────────────────────────────

function DailyBurn({
  analytics,
  scale,
  modeled,
  palette,
}: {
  analytics: AnalyticsSection
  scale: number
  modeled: boolean
  palette: ReturnType<typeof readPalette>
}) {
  const data = useMemo(
    () =>
      analytics.daily.map((d) => ({
        date: new Date(d.day).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        tokens: Math.round(
          (d.inputTokens +
            d.outputTokens +
            d.cacheReadTokens +
            d.reasoningTokens) *
            scale,
        ),
      })),
    [analytics.daily, scale],
  )

  if (data.length === 0) return null

  return (
    <Card
      title="Daily burn"
      accentColor={palette.accent}
      className="h-full"
      titleRight={
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted">
          {modeled ? 'modeled · share' : `${analytics.windowDays}d`}
        </span>
      }
    >
      <div className="h-[220px] w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="tb-burn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={palette.border}
              opacity={0.45}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: palette.muted }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 10, fill: palette.muted }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => formatTokens(v)}
            />
            <Tooltip
              contentStyle={{
                background: palette.card,
                border: `1px solid ${palette.border}`,
                borderRadius: '8px',
                fontSize: '11px',
              }}
              labelStyle={{ color: palette.muted, fontSize: '10px' }}
              formatter={(v: number) => [formatTokens(v), 'tokens']}
            />
            <Area
              type="monotone"
              dataKey="tokens"
              stroke={palette.accent}
              fill="url(#tb-burn)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ── Top models within the variant ────────────────────────────────

function TopModels({
  variant,
  palette,
}: {
  variant: Variant
  palette: ReturnType<typeof readPalette>
}) {
  const models = variant.models.slice(0, 6)
  const max = models.reduce((m, x) => Math.max(m, x.tokens), 0)
  if (models.length === 0) return null
  return (
    <Card title="Top models" accentColor={palette.accentSecondary}>
      <ul className="flex flex-col gap-2.5">
        {models.map((m) => {
          const pct = max > 0 ? (m.tokens / max) * 100 : 0
          return (
            <li key={m.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-mono text-ink">{m.id}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted">
                  {formatTokens(m.tokens)}
                </span>
              </div>
              <div
                className="h-[3px] w-full overflow-hidden rounded-full"
                style={{ background: 'var(--theme-border)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, pct)}%`,
                    background: `linear-gradient(90deg, ${palette.accent}, ${palette.accentSecondary})`,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ── Nate's five rules for reading the chart ──────────────────────

const FIVE_RULES: Array<{ title: string; body: string }> = [
  {
    title: '1 · One number per tool, never one number total',
    body: 'Codex, Claude and ChatGPT count tokens differently. Read each tool on its own tab before you trust any combined figure.',
  },
  {
    title: '2 · Watch the cache, not just input',
    body: 'On long agent runs cache reads dwarf fresh input. A rising cache share is context being re-read — usually cheap, sometimes a smell.',
  },
  {
    title: '3 · Output/input ratio is your “chatty” gauge',
    body: 'A high output-to-input ratio means the model is generating a lot per prompt. Spikes flag runaway loops or over-long generations.',
  },
  {
    title: '4 · Burn follows work, not the calendar',
    body: 'Compare daily burn against what you shipped that day. Tokens with no artifact attached is the waste to hunt down.',
  },
  {
    title: '5 · Cost label beats the dollar figure',
    body: 'Subscription-included runs report ≈ $0. Trust the coverage label (precise / partial / included) before quoting a number to anyone.',
  },
]

function FiveRules({ palette }: { palette: ReturnType<typeof readPalette> }) {
  return (
    <Card title="Five rules for reading the chart" accentColor={palette.warning}>
      <ol className="flex flex-col gap-3">
        {FIVE_RULES.map((r) => (
          <li key={r.title} className="flex flex-col gap-0.5">
            <span className="text-[12px] font-semibold text-ink">{r.title}</span>
            <span className="text-[11px] leading-relaxed text-muted">
              {r.body}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

// ── 15-minute weekly review (interactive, persisted) ─────────────

const REVIEW_STEPS: Array<{ id: string; label: string }> = [
  { id: 'per-tool', label: 'Skim each tool tab — any one burning out of proportion to its value?' },
  { id: 'cache', label: 'Check the cache share. Climbing? Find the context that keeps getting re-read.' },
  { id: 'spikes', label: 'Open the daily burn. Circle every spike and name what caused it.' },
  { id: 'top-model', label: 'Is the top model the one you meant to be using? Re-route if not.' },
  { id: 'cost', label: 'Read the cost label, not the dollar number. Note what’s actually billable.' },
  { id: 'workflow', label: 'Pick one best one-off run this week and turn it into a reusable workflow.' },
]

function WeeklyReview({ palette }: { palette: ReturnType<typeof readPalette> }) {
  const storageKey = 'tokenBurn.weeklyReview'
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) setChecked(JSON.parse(raw) as Record<string, boolean>)
    } catch {
      /* ignore malformed persisted state */
    }
  }, [])

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      }
      return next
    })
  }

  const done = REVIEW_STEPS.filter((s) => checked[s.id]).length

  return (
    <Card
      title="15-minute weekly review"
      accentColor={palette.success}
      titleRight={
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted">
          {done}/{REVIEW_STEPS.length}
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {REVIEW_STEPS.map((s) => {
          const on = !!checked[s.id]
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--theme-card2)]"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px]"
                  style={{
                    borderColor: on ? palette.success : 'var(--theme-border)',
                    background: on ? palette.success : 'transparent',
                    color: on ? 'var(--theme-on-accent, #fff)' : 'transparent',
                  }}
                >
                  ✓
                </span>
                <span
                  className="text-[11px] leading-relaxed"
                  style={{
                    color: on ? 'var(--theme-muted)' : 'var(--theme-text)',
                    textDecoration: on ? 'line-through' : 'none',
                  }}
                >
                  {s.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ── Main screen ──────────────────────────────────────────────────

export function TokenBurnScreen() {
  const navigate = useNavigate()
  const palette = usePalette()

  const [period, setPeriod] = useState<Period>(() => {
    if (typeof window === 'undefined') return 30
    const n = Number(window.localStorage.getItem('tokenBurn.period'))
    return n === 7 || n === 14 || n === 30 ? (n as Period) : 30
  })
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('tokenBurn.period', String(period))
    }
  }, [period])

  const [variantId, setVariantId] = useState<string>('combined')

  const overviewQuery = useQuery<DashboardOverview>({
    queryKey: ['token-burn', 'overview', period],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/overview?days=${period}`)
      if (!res.ok) throw new Error(`overview ${res.status}`)
      return (await res.json()) as DashboardOverview
    },
    staleTime: 5_000,
    refetchInterval: 30_000,
  })

  const analytics = overviewQuery.data?.analytics ?? null
  const variants = useMemo(() => deriveVariants(analytics), [analytics])

  // Keep the selected variant valid as data changes.
  useEffect(() => {
    if (variants.length === 0) return
    if (!variants.some((v) => v.id === variantId)) setVariantId('combined')
  }, [variants, variantId])

  const active: Variant | undefined =
    variants.length > 0
      ? (variants.find((v) => v.id === variantId) ?? variants[0])
      : undefined
  const scale = active?.family ? active.share : 1
  const modeled = !!active?.family

  const hasData = !!analytics && analytics.source === 'analytics' && !!active

  return (
    <div className="min-h-full">
      {/* Floating mobile nav */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-2 h-12"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          type="button"
          aria-label="Open navigation menu"
          onClick={openHamburgerMenu}
          className="flex items-center justify-center w-11 h-11 rounded-xl active:bg-white/10 transition-colors"
        >
          <svg
            width="20"
            height="16"
            viewBox="0 0 20 16"
            fill="none"
            className="opacity-70"
            style={{ color: 'var(--color-ink, #111)' }}
          >
            <path
              d="M1 1.5H19M1 8H19M1 14.5H13"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="px-4 pt-14 md:pt-4 py-4 md:px-8 md:py-6 lg:px-10 space-y-5 pb-28">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--theme-text)', letterSpacing: '-0.015em' }}
          >
            Token Burn
          </h1>
          <p className="text-[13px] text-muted">
            One number per tool, never one number total. Pick a variant to
            read each tool on its own terms.
          </p>
        </div>

        {/* Controls: variant tabs + period */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {variants.length === 0 ? (
              <span className="text-[11px] text-muted">No variants yet</span>
            ) : (
              variants.map((v) => {
                const on = v.id === active?.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] transition-all hover:scale-[1.02]"
                    style={{
                      borderColor: on
                        ? 'var(--theme-accent)'
                        : 'var(--theme-border)',
                      background: on
                        ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)'
                        : 'var(--theme-card)',
                      color: on ? 'var(--theme-accent)' : 'var(--theme-muted)',
                    }}
                    title={
                      v.family
                        ? `${v.label} · ${(v.share * 100).toFixed(0)}% of total tokens`
                        : 'Reconciled view across every tool'
                    }
                  >
                    {v.label}
                    {v.family ? (
                      <span className="ml-1.5 opacity-70">
                        {(v.share * 100).toFixed(0)}%
                      </span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
          <div className="flex items-center gap-1">
            {([7, 14, 30] as const).map((p) => {
              const on = p === period
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className="rounded-md border px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.1em] transition-colors"
                  style={{
                    borderColor: on
                      ? 'var(--theme-accent)'
                      : 'var(--theme-border)',
                    background: on
                      ? 'color-mix(in srgb, var(--theme-accent) 12%, transparent)'
                      : 'transparent',
                    color: on ? 'var(--theme-accent)' : 'var(--theme-muted)',
                  }}
                >
                  {p}d
                </button>
              )
            })}
          </div>
        </div>

        {!hasData ? (
          <Card>
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-[var(--theme-border)] px-4 text-center">
              <p className="text-sm text-muted">
                {overviewQuery.isError
                  ? 'Token analytics are unavailable right now. This view needs the dashboard analytics endpoint.'
                  : overviewQuery.isFetching
                    ? 'Loading token analytics…'
                    : 'No token usage recorded in this window yet. Run a few sessions and check back.'}
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                label="Tokens"
                value={formatTokens(active.tokens)}
                sub={
                  active.family
                    ? `${(active.share * 100).toFixed(0)}% of all tools`
                    : 'across every tool'
                }
                accentColor={palette.accent}
              />
              <Kpi
                label="Sessions"
                value={formatInt(active.sessions)}
                sub={`${formatInt(active.calls)} api calls`}
                accentColor={palette.accentSecondary}
              />
              <Kpi
                label="Tokens / session"
                value={
                  active.sessions > 0
                    ? formatTokens(active.tokens / active.sessions)
                    : '—'
                }
                sub="burn per session"
                accentColor={palette.success}
              />
              <Kpi
                label="Est. cost"
                value={
                  active.cost > 0 ? `$${active.cost.toFixed(2)}` : '≈ $0'
                }
                sub={COST_LABEL_COPY[analytics.costLabel]}
                accentColor={palette.warning}
              />
            </div>

            {/* Chart + mix */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <DailyBurn
                  analytics={analytics}
                  scale={scale}
                  modeled={modeled}
                  palette={palette}
                />
              </div>
              <div className="flex flex-col gap-3 lg:col-span-4">
                <TokenMix
                  analytics={analytics}
                  scale={scale}
                  modeled={modeled}
                />
                <TopModels variant={active} palette={palette} />
              </div>
            </div>

            {modeled ? (
              <p className="text-[10px] leading-relaxed text-muted">
                The input/output/cache/reasoning split and the daily series are
                only reported combined by the gateway. For the{' '}
                <span className="font-semibold">{active.label}</span> variant
                they’re modeled — scaled to this tool’s{' '}
                {(active.share * 100).toFixed(0)}% token share. Per-tool token,
                session, call and cost totals above are exact.
              </p>
            ) : null}

            {/* Guidance: five rules + weekly review */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <FiveRules palette={palette} />
              <WeeklyReview palette={palette} />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate({ to: '/dashboard' })}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] text-muted transition-colors hover:text-[var(--theme-text)]"
                style={{ borderColor: 'var(--theme-border)' }}
              >
                ← Back to dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
