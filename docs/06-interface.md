# 06 — Interface

## Layout base

Três colunas, com barra de status no rodapé.

- **Sidebar (esquerda):** repositórios conectados + lista de funcionários.
- **Painel central:** tarefa/chat ativa.
- **Painel direito (contextual):** diff de código ou detalhes.
- **Barra de status (rodapé):** provedor de IA ativo, tokens usados, custo estimado da sessão.

## Telas

1. **Dashboard / Home** — funcionários disponíveis (cards com avatar, nome, função), repositórios conectados, tarefas recentes.
2. **Editor de Funcionário** — nome, avatar, função, prompt de sistema (textarea grande), provedor preferido + fallback, permissões, escopo de repositórios.
3. **Tela de Tarefa (chat)** — conversa com um funcionário sobre um repo; painel direito com diff e botões Aprovar / Rejeitar.
4. **Modal de Fallback de IA** — "Os créditos do Claude acabaram. Continuar com o ChatGPT?" com tokens restantes de cada provedor.
5. **Configurações** — conexão com GitHub (token), provedores de IA conectados com status/uso, chaves mascaradas, tema.

## Estética

Visual profissional para desenvolvedores. Dark mode como padrão (com light). Referências: Linear, Raycast, VS Code — denso mas respirável, cantos suaves, tipografia clara, um acento vibrante. Nada infantil.

---

## Prompt para o Claude Design

Cole o texto abaixo no Claude Design para gerar os protótipos.

> Crie protótipos de alta fidelidade para um **app desktop** chamado **DevCrew**: um orquestrador de agentes de IA para desenvolvimento de software, onde o usuário monta uma "equipe de funcionários de IA", cada um com uma função especializada, que atuam sobre repositórios Git locais.
>
> **Público e tom:** ferramenta profissional para desenvolvedores. Visual moderno, limpo, dark mode como padrão (com opção light). Estética tipo Linear / Raycast / VS Code — denso mas respirável, cantos suaves, tipografia clara, acentos em uma cor vibrante. Nada infantil.
>
> **Sistema de design:** use **shadcn/ui** (Radix + Tailwind) como base de componentes. Aproveite os componentes nativos do shadcn — `Card`, `Button`, `Badge`, `Dialog`, `Tabs`, `Input`, `Textarea`, `Select`, `Switch`, `Avatar`, `ScrollArea`, `Separator`, `Tooltip`, `Sheet`, `Table`, `Sidebar` — e siga os design tokens do shadcn (variáveis CSS `--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--radius`). Ícones com `lucide-react`. Mantenha a aparência coerente com um app shadcn bem feito.
>
> **Layout base:** três colunas. (1) Sidebar esquerda com repositórios conectados e lista de funcionários. (2) Painel central de trabalho/chat. (3) Painel direito contextual (diff de código ou detalhes). Barra de status no rodapé mostrando provedor de IA ativo, tokens usados e custo estimado da sessão.
>
> **Gere estas telas:**
> 1. **Dashboard / Home** — visão geral: projetos ativos, equipes, funcionários (cards com avatar, nome, função), tarefas recentes.
> 2. **Projetos** — lista de projetos (cada um = um repositório + uma equipe designada). Botões "Criar projeto do zero" e "Conectar projeto existente". Card do projeto mostra repo, equipe designada e status das tarefas.
> 3. **Equipes** — gerenciar equipes: criar equipe, adicionar/remover funcionários, e direcionar uma equipe a um projeto.
> 4. **Editor de Funcionário** — formulário para criar/editar um "funcionário": nome, avatar, função (ex: Orquestrador/PO, Dev, QA, Documentador, Arquiteto), prompt de sistema (textarea grande), provedor de IA preferido + fallback, permissões (só leitura / escrita / pode commitar), escopo de repositórios.
> 5. **Board de Tarefas** — quadro estilo kanban com colunas por status (Pendente, Em andamento, PR aberto, Mudanças solicitadas, Aprovado pelo QA, Aguardando merge, Concluído). Cada card mostra funcionário responsável, projeto, número de rodadas Dev↔QA e custo acumulado.
> 6. **Fila por Funcionário** — visão focada em um funcionário: suas tarefas em fila/andamento e um indicador do que ele está fazendo agora.
> 7. **Tela de Tarefa (detalhe)** — a task com seu histórico, o PR vinculado (número, descrição, diff), reviews/comentários do QA, e o contador de rodadas + custo com os tetos. Painel de diff com verde/vermelho. Ação de **merge** disponível só para o usuário (destacar que o app nunca faz merge sozinho).
> 8. **Terminal ao vivo** — painel com abas por funcionário mostrando o I/O real dos processos (comandos git, testes, saída) transmitido em tempo real. Visual de terminal (fonte monoespaçada, fundo escuro). Deixar claro que é espelho de processos, não IA narrando.
> 9. **Modal de Fallback de IA** — um modal elegante: "Os créditos do Claude acabaram. Deseja continuar esta tarefa com o ChatGPT?" com opções Continuar com ChatGPT / Pausar. Mostrar tokens restantes de cada provedor.
> 10. **Modal de Loop Pausado** — "A tarefa foi pausada: atingiu o teto de rodadas/custo." Mostrar última rodada, último comentário do QA e custo acumulado, com opções Retomar / Assumir manualmente.
> 11. **Configurações** — conexão com GitHub (via token), provedores de IA conectados (Claude, ChatGPT) com status e uso, chaves de API (mascaradas), tetos padrão de rodadas/custo, tema.
>
> **Mapeamento para componentes shadcn:** cards de funcionário/projeto com `Card` + `Avatar` + `Badge`; sidebar com o componente `Sidebar`; board de tarefas em colunas usando `Card` e `Badge` de status; fila por funcionário e terminal com `Tabs` + `ScrollArea`; formulário do editor com `Input`, `Textarea`, `Select` (provedor/fallback), `Switch` e `Badge` (permissões/escopo); equipes com `Card`, `Avatar` e `Command`/`Select` para adicionar membros; detalhe da task com `Separator`, `Badge` (rodadas/custo) e `Progress` (custo vs. teto); painel de diff com blocos verde/vermelho e `Button` (Aprovar/Rejeitar/Merge); terminal com fonte monoespaçada dentro de `ScrollArea`; modais de fallback e loop pausado com `Dialog`; configurações com `Tabs`, `Input` (chaves mascaradas), `Slider`/`Input` (tetos) e `Switch` (tema); status de provedor com `Badge`; barra de custo/tokens no rodapé.
>
> **Componentes recorrentes:** cards de funcionário com badge de função, badges de status de provedor, visualizador de diff com verde/vermelho, indicador de custo/tokens, empty states amigáveis.
>
> Use dados fictícios realistas (funcionários com nomes de função, repos como "portfolio", "api-server", tarefas como "Escrever testes para o módulo de auth"). Priorize que pareça um produto real e polido, pronto para portfólio.
