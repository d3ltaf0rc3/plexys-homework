<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { handleCallback } from '../auth/oauth'

const route = useRoute()
const router = useRouter()
const error = ref(null)

onMounted(async () => {
  try {
    router.replace(await handleCallback(route.query))
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <section class="center">
    <template v-if="error">
      <p class="alert">Sign-in failed: {{ error }}</p>
      <RouterLink to="/" class="btn">Try again</RouterLink>
    </template>
    <p v-else class="muted">Signing you in…</p>
  </section>
</template>
