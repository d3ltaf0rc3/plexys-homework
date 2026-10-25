import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { restoreSession } from './auth/oauth'
import './style.css'

// Resume the session (if any) before the router's auth guard runs.
await restoreSession()

createApp(App).use(router).mount('#app')
