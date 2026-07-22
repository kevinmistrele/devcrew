# 01 — Visão Geral

## O problema

Ferramentas de IA para código hoje são ou muito genéricas (um chat solto) ou muito fechadas. Falta um ambiente onde você:

- Configure **agentes especializados** e reutilizáveis, cada um com sua função e regras.
- Deixe esses agentes **agirem sobre seus repositórios locais** com segurança.
- Use **mais de um provedor de IA** e continue trabalhando quando os créditos de um acabam.

## A proposta

Um app desktop onde você monta sua **equipe de funcionários de IA**. Você cria funcionários, dá tarefas sobre repositórios Git locais, revisa as mudanças propostas em um diff e aprova antes de qualquer coisa tocar o disco.

## Conceitos-chave

### Funcionário (Employee)
Um agente configurável com:
- **Função/papel** — ex: Revisor, Testador, Documentador, Dev, Arquiteto.
- **Prompt de sistema** — a personalidade e as regras do agente.
- **Permissões** — só leitura, escrita, ou pode commitar.
- **Provedor preferido + fallback** — qual IA usar.
- **Escopo** — quais repositórios e pastas pode tocar.

### Repositório (Repo)
Um projeto Git clonado/acessado localmente. Os agentes leem e propõem mudanças, sempre em branches isoladas.

### Tarefa (Task)
Uma unidade de trabalho: você escolhe funcionário + repo + descreve o que quer. O agente monta contexto, consulta a IA, e devolve mudanças propostas para aprovação.

### Roteador de IA (AI Router)
A camada que abstrai os provedores, conta tokens/custo e faz o fallback quando um provedor esgota os créditos — sempre perguntando antes de trocar.

### Projeto
Um repositório (novo ou existente) associado a uma equipe. É o contêiner que liga "onde" (repo) a "quem" (equipe).

### Equipe (Team)
Um agrupamento de funcionários, direcionado a um projeto. Um funcionário pode participar de mais de uma equipe.

### Orquestrador
Um funcionário com papel de PO/Tech Lead: interpreta o que você pede, quebra em tasks e distribui para os outros funcionários da equipe — ver [`07-colaboracao-e-fluxos.md`](./07-colaboracao-e-fluxos.md).

## Por que impressiona recrutadores

- Arquitetura modular e desacoplada (interfaces claras entre Git, IA e UI).
- App desktop em Tauri (Rust + React), não só mais um CRUD web.
- Trata temas reais: segurança de chaves, aprovação humana, isolamento em branches, contagem de custo.
- Metáfora intuitiva ("equipe de funcionários") que demonstra pensamento de produto.
- Colaboração entre agentes acionada por **eventos reais do GitHub** (PR aberto, review, comentário) via polling eficiente — não é IA simulando conversa, é um loop Dev↔QA de verdade, travado por rodadas/custo e com merge sempre humano.
