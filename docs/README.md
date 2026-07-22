# DevCrew — Documentação

**DevCrew** é um app desktop que orquestra uma "equipe de funcionários de IA" para desenvolvimento de software. Cada funcionário é um agente com uma função especializada (Revisor, Testador, Documentador, Dev, Arquiteto), atuando sobre repositórios Git locais. Suporta múltiplos provedores de IA (Claude, ChatGPT) com fallback quando os créditos de um acabam.

## Índice da documentação

| Arquivo | Conteúdo |
|---|---|
| [`01-visao-geral.md`](./01-visao-geral.md) | O problema, a proposta e os conceitos-chave |
| [`02-arquitetura.md`](./02-arquitetura.md) | Stack, módulos, fluxos e segurança |
| [`03-roadmap.md`](./03-roadmap.md) | Plano em fases (Fase 0 → Fase 4) |
| [`04-modelo-de-dados.md`](./04-modelo-de-dados.md) | Schema do SQLite e interfaces TypeScript |
| [`05-multi-ia-fallback.md`](./05-multi-ia-fallback.md) | Como funciona o roteador de IA e o fallback |
| [`06-interface.md`](./06-interface.md) | Telas, layout e o prompt para o Claude Design |
| [`07-colaboracao-e-fluxos.md`](./07-colaboracao-e-fluxos.md) | Projetos, equipes, colaboração entre agentes, polling e terminal |

## Stack resumida

- **Desktop:** Tauri (Rust + WebView)
- **Frontend:** React + TypeScript + Vite + Tailwind
- **Git:** `git2` (Rust) ou `simple-git` (Node)
- **IA:** SDKs oficiais Anthropic e OpenAI
- **Persistência:** SQLite local
- **Segurança de chaves:** keychain do SO (nunca texto plano)

## Princípios

1. **Aprovação humana sempre** — nenhuma escrita, commit ou push acontece sem confirmação explícita.
2. **Isolamento** — agentes trabalham em branches isoladas, nunca na `main`.
3. **Escopo por funcionário** — cada agente só toca nos repos/pastas que você permitir.
4. **Multi-IA com controle** — o roteador pausa e pergunta antes de trocar de provedor.
5. **Merge sempre seu** — o loop Dev↔QA roda autônomo até convergir ou bater uma trava, mas o app nunca dá merge sozinho.
