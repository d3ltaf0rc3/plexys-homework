import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './auth/oauth'
import RecordList from './views/RecordList.vue'
import AuthCallback from './views/AuthCallback.vue'
import SignIn from './views/SignIn.vue'
import { config } from './config'

const router = createRouter({
  history: createWebHistory(config.basePath),
  routes: [
    { path: '/', component: RecordList },
    { path: '/auth/callback', component: AuthCallback, meta: { public: true } },
    { path: '/signin', component: SignIn, meta: { public: true } },
    // Other modules by handle, e.g. /customer (see appModules()).
    { path: '/:handle([a-z][a-z0-9_]*)', component: RecordList, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const { isAuthenticated } = useAuth()
  if (!to.meta.public && !isAuthenticated.value) {
    return { path: '/signin', query: to.fullPath !== '/' ? { returnTo: to.fullPath } : {} }
  }
})

export default router
