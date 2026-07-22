# 07 — Colaboração e Fluxos entre Agentes

Esta é a parte que transforma o DevCrew de "agentes isolados" em "um time que trabalha junto". Os funcionários deixam de responder só a você e passam a **acionar uns aos outros** reagindo a eventos reais do GitHub.

## Conceitos que entram aqui

### Projeto
Contêiner que aponta para um repositório (novo ou existente) + uma equipe designada.
- **Criar do zero:** o app inicializa o repo e a estrutura base.
- **Conectar existente:** aponta para um repo já clonado localmente.

### Equipe (Team)
Agrupamento de funcionários. Você pode ter várias equipes e direcionar cada uma para um projeto.
Relação: `Projeto → Equipe → Funcionários`.

### Orquestrador
Um funcionário com papel de PO/Tech Lead: recebe sua ideia, quebra em tasks e distribui (uma pro Dev, uma pro QA). Ao criar as tasks, dispara o fluxo.

## O motor: eventos reais do GitHub

O DevCrew **não simula** colaboração — ele reage a eventos de verdade do repositório. Um agente conclui seu trabalho e produz um artefato real no GitHub (branch, PR, comentário, review). O app detecta esse evento e aciona o próximo agente.

### Detecção por polling (recomendado para app desktop)

Webhook exigiria que o GitHub alcançasse sua máquina (túnel ou servidor) — infra a mais para um app que roda localmente e às vezes está fechado. Por isso: **polling**.

Regras para o polling ser eficiente:
- **Só com tarefa ativa:** não fica pollando o tempo todo, apenas quando há um loop em andamento naquele projeto.
- **ETags / `If-None-Match`:** quando nada mudou, o GitHub responde `304 Not Modified` e essa resposta **não conta** no rate limit.
- **Intervalo adaptativo:** rápido (5–10s) quando um loop está quente; lento (60s+) quando ocioso.

> **Importante — duas cotas diferentes:** polling usa a **API do GitHub** (rate limit de ~5.000 req/h com token, gratuito), **não gasta token de IA**. Token de IA só é consumido quando um agente **pensa/gera** (Dev gera código, QA analisa diff, Dev ajusta). O vigia não pensa — só avisa. Quem gasta token é o agente, e só quando há trabalho real.

> Webhook fica documentado como **evolução futura** para quem rodar em servidor.

## Fluxo 1 — Dev ↔ QA

```
Você aciona a task (ou o Orquestrador cria)
        │
        ▼
[Dev] cria branch isolada → gera código → push → abre PR (real, no GitHub)
        │
        ▼  (polling detecta "PR aberto")
[QA] lê a task + descrição do PR + diff do código
        │
        ├── tudo certo ──► [QA] aprova o review (approve)
        │                        │
        │                        ▼
        │                  App te chama: "PR aprovado pelo QA. Pronto para merge."
        │                        │
        │                        ▼
        │                  VOCÊ faz o merge (o app nunca faz merge)
        │
        └── tem problema ─► [QA] comenta no PR pedindo mudanças (changes requested)
                                 │
                                 ▼  (polling detecta "changes requested")
                           [Dev] lê os comentários → ajusta → push
                                 │
                                 └────────► volta pro QA (loop)
```

Regras:
- **Merge é sempre seu.** O app pode preparar tudo, mas nunca dá merge sozinho.
- Todo o loop Dev↔QA roda **autônomo** até convergir ou bater uma trava.

## Fluxo 2 — Orquestrador → tasks

```
Você descreve a funcionalidade que quer
        │
        ▼
[Orquestrador] interpreta → quebra em tasks
        │
        ├──► cria task pro [Dev]  (ex: "implementar endpoint de login")
        └──► cria task pro [QA]   (ex: "validar endpoint de login")
        │
        ▼
[Dev] pega a task automaticamente → entra no Fluxo 1
```

Tudo isso depende de **como você configura os prompts** de cada funcionário. O sistema fornece o encanamento (eventos, tasks, PRs); o comportamento vem do prompt de cada agente.

## Trava de segurança do loop

Para o loop Dev↔QA não girar para sempre nem queimar orçamento, dois tetos simultâneos (o que bater primeiro **pausa e te chama**):

- **Teto de rodadas:** ex. 5 idas-e-voltas Dev↔QA.
- **Teto de custo/tokens por tarefa:** ex. US$ 2 ou 200k tokens.

Ambos configuráveis por tarefa/equipe. Ao pausar, o app mostra onde travou (última rodada, último comentário do QA, custo acumulado).

## Terminal ao vivo (custo zero de UI)

O terminal é um **espelho de I/O real** dos processos que cada agente executa — não é IA narrando.

**Regra de ouro:** *nenhuma chamada de IA existe só para alimentar a UI.* Todo texto na tela é:
- **I/O de processo** (comandos git, testes, build): `stdout`/`stderr` transmitido direto → **custo zero de token**.
- **Eco de uma resposta de IA que já teve que acontecer** (o código que o Dev gerou, a análise do QA): reaproveitado, sem segunda chamada.

Assim você vê tudo que acontece em tempo real sem pagar nada além do trabalho real do agente. Cada funcionário tem sua aba/stream no terminal.

## Resumo do modelo

- **Projetos** contêm um repo (novo ou existente) + uma equipe.
- **Equipes** agrupam funcionários; você direciona equipe → projeto.
- **Colaboração via eventos reais do GitHub**, detectados por **polling eficiente** (ETags, adaptativo, só com tarefa ativa) — sem gastar token de IA.
- **Loop Dev↔QA autônomo**, travado por **rodadas + custo**; **merge sempre seu**.
- **Orquestrador** quebra sua ideia em tasks e dispara o fluxo.
- **Fila de tarefas por funcionário** + **terminal-espelho** de I/O real.
