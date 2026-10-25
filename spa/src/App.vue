<script setup>
import { watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from './auth/oauth'
import { useSchema, appModules } from './composables/useSchema'

const router = useRouter()
const route = useRoute()
const { isAuthenticated, userName, logout } = useAuth()
const { modules, load } = useSchema()

// Session dropped (logout or failed refresh): send the user to sign in.
watch(isAuthenticated, (authed) => {
  if (!authed && !route.meta.public) router.push('/signin')
})

watch(isAuthenticated, (authed) => { if (authed) load() }, { immediate: true })

// One nav entry per section; the first (ticket) module lives at "/".
const nav = computed(() => {
  void modules.value // recompute once the schema has loaded
  return appModules().map((m, i) => ({ to: i === 0 ? '/' : `/${m.handle}`, label: `${m.name}s` }))
})
</script>

<template>
  <a href="#main" class="skip-link">Skip to content</a>
  <header class="topbar">
    <RouterLink to="/" class="brand">Support desk</RouterLink>
    <nav v-if="isAuthenticated && nav.length > 1" class="topbar__nav" aria-label="Sections">
      <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="topbar__link" exact-active-class="is-active">
        {{ n.label }}
      </RouterLink>
    </nav>
    <div v-if="isAuthenticated" class="topbar__user">
      <span class="muted topbar__name">{{ userName }}</span>
      <button type="button" class="btn btn--ghost btn--small" @click="logout">Sign out</button>
    </div>
  </header>
  <main id="main" class="container" tabindex="-1">
    <!-- Keyed by path so switching modules mounts a fresh list. -->
    <RouterView :key="route.path" />
  </main>
</template>
