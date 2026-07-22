import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Aplica a classe `dark` no <html> de forma síncrona, antes do primeiro paint — precisa
// vir antes de qualquer outro import pra não piscar o tema errado.
import '@/core/theme'
// Só o import já basta: registra o loop-controller como observador dos eventos que o
// github-service detecta por polling (ver core/loop-controller — Fluxo 1 do Dev↔QA).
import '@/core/loop-controller'
// Idem: assina os eventos `terminal:line` que o backend Rust emite (Terminal ao vivo, docs/07).
import '@/core/terminal-service'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
