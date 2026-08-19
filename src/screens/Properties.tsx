/**
 * Properties.
 *
 * Deliberately thin. Full listing management is out of scope for v1 — the record
 * exists so an inspection and a deal can point at a specific unit. It is written to
 * be widened later, not to pretend to be a listings system now.
 */
import { useMemo, useState } from 'react'
import { useScopedData } from '@/data/selectors'
import { dealNgnMinor, isWon } from '@/data/derive'
import { formatMoneyCompact, formatMoneyWhole } from '@/data/money'
import { pluralize } from '@/lib/format'
import { Badge, Card, PageHeader, StatTile, Tabs } from '@/components/ui'
import { PropertyStatusBadge, PropertyTile } from '@/components/domain'

export default function Properties() {
  const { db, deals, activities } = useScopedData()
  const [tab, setTab] = useState<'selling' | 'sold'>('selling')

  const selling = db.properties.filter((p) => p.status !== 'sold')
  const sold = db.properties.filter((p) => p.status === 'sold')
  const list = tab === 'selling' ? selling : sold

  const stats = useMemo(() => {
    const map = new Map<string, { inspections: number; deals: number; sold: number }>()
    for (const p of db.properties) map.set(p.id, { inspections: 0, deals: 0, sold: 0 })
    for (const a of activities) {
      if (a.type !== 'inspection' || !a.property_id) continue
      const s = map.get(a.property_id)
      if (s) s.inspections += 1
    }
    for (const d of deals) {
      if (!d.property_id) continue
      const s = map.get(d.property_id)
      if (!s) continue
      s.deals += 1
      if (isWon(db, d)) s.sold += dealNgnMinor(d)
    }
    return map
  }, [db, deals, activities])

  return (
    <>
      <PageHeader
        eyebrow="Properties"
        title="Developments"
        description="The portfolio, with availability, price and the inspections and deals attached to each development."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Now selling" value={selling.length} sub={`${sold.length} developments sold out`} tone="won" />
        <StatTile
          label="Units available"
          value={selling.reduce((s, p) => s + p.units_available, 0)}
          sub={`of ${selling.reduce((s, p) => s + p.units_total, 0)} across live developments`}
        />
        <StatTile
          label="Inspections logged"
          value={activities.filter((a) => a.type === 'inspection').length}
          sub="In your view, all time"
        />
        <StatTile
          label="Entry price"
          value={formatMoneyCompact(Math.min(...selling.map((p) => p.list_price_minor)))}
          sub="Lowest current list price"
        />
      </div>

      <div className="mt-4 mb-4">
        <Tabs
          tabs={[
            { id: 'selling', label: 'Now selling', count: selling.length },
            { id: 'sold', label: 'Sold out', count: sold.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const s = stats.get(p.id)!
          const pct = p.units_total > 0 ? ((p.units_total - p.units_available) / p.units_total) * 100 : 100
          return (
            <Card key={p.id}>
              <div className="flex items-start gap-3">
                <PropertyTile property={p} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold text-ink-900">{p.title}</div>
                  <div className="truncate text-[12.5px] text-ink-500">{p.location}</div>
                </div>
                <PropertyStatusBadge status={p.status} />
              </div>

              <div className="mt-3 text-[12.5px] text-ink-600">{p.property_type}</div>

              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="text-[11px] text-ink-400">
                    {p.status === 'sold' ? 'Closed at' : 'From'}
                  </div>
                  <div className="tnum font-display text-[19px] font-semibold text-ink-900">
                    {formatMoneyWhole(p.list_price_minor)}
                  </div>
                </div>
                {p.status !== 'sold' && (
                  <div className="text-right">
                    <div className="tnum text-[13px] font-medium text-ink-800">
                      {p.units_available} of {p.units_total}
                    </div>
                    <div className="text-[11px] text-ink-400">units left</div>
                  </div>
                )}
              </div>

              {p.status !== 'sold' && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${pct}%` }}
                    title={`${Math.round(pct)}% taken`}
                  />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2.5">
                <Badge tone="neutral">{pluralize(s.inspections, 'inspection')}</Badge>
                <Badge tone="neutral">{pluralize(s.deals, 'deal')}</Badge>
                {s.sold > 0 && <Badge tone="won">{formatMoneyCompact(s.sold)} sold</Badge>}
              </div>
            </Card>
          )
        })}
      </div>


    </>
  )
}
