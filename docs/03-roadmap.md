# 03 — Roadmap

Plano em fases. Cada fase entrega algo utilizável e some com dependências não resolvidas antes de avançar.

## Fase 0 — Fundação (esqueleto)

**Meta:** ver a árvore de arquivos de um repo dentro do app.

- App Tauri + React rodando.
- Sidebar (vazia) e layout de três colunas.
- Conexão com GitHub via Personal Access Token.
- Clonar/listar um repositório local e exibir a árvore de arquivos.
- Sem IA ainda.

## Fase 1 — MVP (o coração)

**Meta:** uma ferramenta já usável.

- Criar/editar **um funcionário** (nome, papel, prompt de sistema, provedor).
- Conectar **um provedor de IA** (começar pela Anthropic).
- Dar uma tarefa a um funcionário sobre um repo → ele lê arquivos e propõe mudanças.
- **Painel de diff:** aprovar ou rejeitar antes de aplicar no disco.
- Sem push automático — só escreve em arquivos locais mediante aprovação.

## Fase 2 — Multi-IA com fallback

**Meta:** nunca travar por falta de créditos.

- Segundo provedor (OpenAI).
- Roteador com **contagem de tokens/custo** por sessão.
- Detecção de quota esgotada/erro → **modal** "Créditos do Claude acabaram. Continuar com ChatGPT?".
- Troca **entre tarefas** primeiro (histórico reenviado ao novo provedor).

## Fase 3 — Equipe colaborando

**Meta:** funcionários trabalhando juntos, acionados por eventos reais do GitHub — não mais um chat manual, um time. Ver [`07-colaboracao-e-fluxos.md`](./07-colaboracao-e-fluxos.md) para o desenho completo.

- **Projetos e equipes:** criar projeto do zero ou conectar um existente (repo + equipe designada); criar equipes e atribuir funcionários a elas.
- **Orquestrador:** funcionário com papel de PO/Tech Lead que quebra sua ideia em tasks e distribui (ex: uma pro Dev, uma pro QA).
- **Detecção de eventos do GitHub por polling:** PR aberto, review aprovado, mudanças solicitadas, push — com ETag e intervalo adaptativo, só enquanto há tarefa ativa no projeto. Sem webhook (app desktop não tem endereço público).
- **Loop Dev↔QA autônomo:** Dev cria branch isolada → gera código → push → abre PR real; QA lê a task + diff real e aprova ou pede mudanças; repete até convergir. Merge continua sempre seu — o app nunca faz merge sozinho.
- **Trava de segurança do loop:** teto de rodadas e de custo/tokens por tarefa (configuráveis); ao bater um teto, pausa e mostra onde travou (última rodada, comentário do QA, custo acumulado).
- **Board de tarefas (kanban)** por status (Pendente → Em andamento → PR aberto → Mudanças solicitadas → Aprovado pelo QA → Aguardando merge → Concluído) e fila por funcionário.
- **Terminal ao vivo:** aba por funcionário espelhando o I/O real dos processos (git, testes, build) — nenhuma chamada de IA extra só pra alimentar a UI.

## Fase 4 — Polimento pra portfólio

**Meta:** parecer produto de verdade.

- Onboarding, tema claro/escuro, empty states caprichados.
- Dashboard de custo/uso.
- README com GIFs, screenshots e diagrama de arquitetura.

## Ordem de prioridade

Fase 0 → 1 já é um projeto apresentável. Fases 2 e 3 são os diferenciais que impressionam. Fase 4 é o que transforma em portfólio.
