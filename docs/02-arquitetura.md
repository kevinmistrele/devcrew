# 02 — Arquitetura

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Shell desktop | **Tauri** (Rust + WebView) | Leve, seguro, acesso nativo ao filesystem/Git |
| Frontend | **React + TypeScript + Vite** | Rápido, tipado, seu domínio |
| Estilo | **Tailwind CSS** | UI densa e consistente com pouco código |
| Backend local | **Comandos Tauri (Rust)** | I/O sensível (Git, chaves) fora do WebView |
| Git | **git2** (Rust) ou **simple-git** (Node) | Operações de repositório |
| IA | **SDKs Anthropic + OpenAI** | Provedores oficiais |
| Persistência | **SQLite** local | Funcionários, tarefas, histórico, config |
| Chaves | **Keychain do SO** (plugin keyring/stronghold) | Nunca em texto plano |

## Módulos

```
core/
  git-service       → clonar, ler, escrever, branch, commit local
  github-service    → API do GitHub: PRs, reviews, comentários, polling de eventos
  ai-router         → abstrai provedores, conta tokens, faz fallback
  provider/
    anthropic       → adaptador da API da Anthropic
    openai          → adaptador da API da OpenAI
  employee-manager  → CRUD de funcionários, prompts, permissões
  team-manager      → CRUD de equipes, vínculo funcionário ↔ equipe
  project-manager   → CRUD de projetos (repo + equipe), criar do zero ou conectar existente
  task-runner       → orquestra uma tarefa (contexto → IA → diff)
  loop-controller   → conduz o loop Dev↔QA a partir de eventos, aplica tetos de rodadas/custo
  diff-engine       → gera e aplica diffs com aprovação
ui/
  sidebar           → projetos + funcionários
  board             → tarefas em kanban por status
  chat              → tarefa ativa
  diff-viewer       → mudanças propostas (aprovar/rejeitar)
  terminal          → espelho de I/O real dos processos por funcionário
  cost-bar          → provedor ativo, tokens, custo
  employee-editor   → criar/editar funcionário
  team-editor       → criar/editar equipe
```

O ponto forte da arquitetura é o **desacoplamento**: cada provedor de IA implementa a mesma interface, cada serviço tem uma fronteira clara. Isso mantém o `task-runner` agnóstico a qual IA está por trás. O `loop-controller` é o que fecha o ciclo Dev↔QA: consome eventos que o `github-service` detecta via polling, decide quem age em seguida e para no teto de rodadas/custo — ver [`07-colaboracao-e-fluxos.md`](./07-colaboracao-e-fluxos.md).

## Fluxo de uma tarefa

1. Você escolhe **funcionário + repo** e descreve a tarefa.
2. `task-runner` monta o **contexto** (prompt do funcionário + arquivos relevantes do repo).
3. `ai-router` escolhe o provedor; se falhar por quota → **pausa e pergunta** se troca.
4. A IA responde com **mudanças propostas**.
5. `diff-engine` renderiza o **diff**; você aprova ou rejeita.
6. Ao aprovar, aplica no disco (e, opcionalmente, cria branch / commit / PR — sempre com confirmação).

Esse é o fluxo de **um funcionário sozinho**, acionado por você. Quando um projeto tem uma equipe (Dev + QA) e o Orquestrador dispara as tasks, o `loop-controller` assume o encadeamento entre funcionários a partir de eventos do GitHub, sem você precisar acionar cada passo — ver [`07-colaboracao-e-fluxos.md`](./07-colaboracao-e-fluxos.md).

## Segurança

- **Aprovação humana:** commit, push e PR sempre exigem confirmação explícita.
- **Merge sempre seu:** o loop Dev↔QA roda autônomo até convergir, mas o app nunca dá merge sozinho.
- **Isolamento:** agentes trabalham em branch isolada, nunca direto na `main`.
- **Escopo por funcionário:** define quais repos e pastas cada agente pode tocar.
- **Chaves protegidas:** API keys ficam no keychain do SO, fora do SQLite.
- **Ações destrutivas bloqueadas por padrão:** deletar arquivos/branches requer confirmação extra.
- **Loop travado por padrão:** todo loop Dev↔QA tem teto de rodadas e de custo; ao bater um teto, pausa e te chama.

## Decisões de design a registrar

- **Tauri vs Electron:** Tauri por ser mais leve e por valorizar o portfólio (Rust).
- **Fallback entre tarefas antes de no meio da tarefa:** começar simples e confiável; troca no meio da mesma tarefa vem depois.
- **Rust vs Node no backend:** I/O sensível (chaves, Git) em Rust; lógica de orquestração pode viver no TS se preferir velocidade de desenvolvimento.
- **Polling em vez de webhook:** um app desktop não tem endereço público estável para o GitHub chamar; polling com ETag e intervalo adaptativo evita gastar rate limit sem exigir infraestrutura de servidor — ver [`07-colaboracao-e-fluxos.md`](./07-colaboracao-e-fluxos.md).
