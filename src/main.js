import { createApp } from 'vue'
import { createPinia } from 'pinia'

import 'bootstrap/dist/css/bootstrap.min.css'
import '@/assets/styles/main.scss'

import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/authStore'

const app = createApp(App).use(createPinia())

/**
add firestore
 */
useAuthStore().init()

app.use(router).mount('#app')
