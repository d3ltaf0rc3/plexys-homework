<script setup>
import { useRoute } from 'vue-router'
import { useAuth } from '../auth/oauth'

const route = useRoute()
const { login } = useAuth()
</script>

<template>
  <section class="center card narrow">
    <h1>Sign in</h1>
    <p class="muted">This app manages records stored in Corteza. Sign in with your Corteza account to continue.</p>
    <button type="button" class="btn btn--primary" @click="login(route.query.returnTo || '/')">
      Sign in with Corteza
    </button>
  </section>
</template>
