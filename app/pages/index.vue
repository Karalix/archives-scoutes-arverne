<script setup lang="ts">
const { data: site } = await useSite()
const { data: years } = await useFetch('/api/public/years', { key: 'years' })

// F-03 : regroupement par décennie au-delà de ~20 années
const groups = computed(() => {
  const list = years.value ?? []
  if (list.length <= 20) return [{ label: null as string | null, years: list }]
  const map = new Map<number, typeof list>()
  for (const y of list) {
    const d = Math.floor(y.startYear / 10) * 10
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(y)
  }
  return [...map.entries()].map(([d, ys]) => ({ label: `Années ${d}`, years: ys }))
})

const span = computed(() => {
  const l = years.value ?? []
  return l.length ? `${l.at(-1)!.startYear} – ${l[0]!.startYear + 1}` : ''
})

useSeoMeta({ description: () => site.value?.intro?.slice(0, 160) || `Archives de ${site.value?.name}` })
</script>

<template>
  <PublicWall class="pt-16 sm:pt-24 space-y-20 sm:space-y-28">
    <section class="grid gap-10 md:grid-cols-12">
      <div class="md:col-span-8">
        <p class="label mb-6">
          Archives{{ span ? ` · ${span}` : '' }}
        </p>
        <h1 class="text-5xl sm:text-7xl lg:text-8xl font-light tracking-[-0.03em] leading-[0.95]">
          {{ site?.name }}
        </h1>
      </div>
      <div class="md:col-span-4 md:pt-14 text-muted leading-relaxed">
        <!-- eslint-disable-next-line vue/no-v-html -- miniMarkdown échappe tout le HTML -->
        <div v-if="site?.intro" class="prose-lite" v-html="miniMarkdown(site.intro)" />
        <p v-else>
          Photographies, montages vidéo de camps, chants, carnets et journaux, classés par année scoute.
        </p>
      </div>
    </section>

    <section v-if="!years?.length" class="border-t border-default pt-8">
      <p class="label">
        Aucune archive publiée pour l'instant
      </p>
    </section>

    <section v-for="g in groups" :key="g.label ?? 'all'" class="space-y-8">
      <div class="flex items-baseline justify-between border-t border-(--ui-border-accented) pt-4">
        <h2 class="label text-default!">
          {{ g.label ?? 'Les années' }}
        </h2>
        <span class="label">{{ g.years.length }}</span>
      </div>
      <ul class="grid gap-x-8 sm:gap-y-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        <li v-for="y in g.years" :key="y.startYear">
          <PublicYearCard :year="y" />
        </li>
      </ul>
    </section>

    <p v-if="years?.some(y => y.locked)" class="text-sm text-muted max-w-xl">
      Les années récentes sont réservées aux familles du groupe : leurs images ne sont pas exposées publiquement tant que les jeunes sont mineurs.
    </p>
  </PublicWall>
</template>
