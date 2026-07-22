# 05 — Multi-IA e Fallback

## Objetivo

Usar mais de um provedor de IA (Claude, ChatGPT) e continuar trabalhando quando os créditos de um acabam — sem perder o contexto da tarefa e sem trocar sem você saber.

## Princípio central

O roteador **não troca de provedor sozinho**. Quando detecta esgotamento de quota ou erro do provedor, ele **pausa a tarefa e pergunta**. Você decide.

## Como funciona

Cada provedor implementa o mesmo contrato:

```ts
interface AIProvider {
  id: ProviderId;
  send(messages: Message[], systemPrompt: string): Promise<AIResponse>;
  isQuotaError(err: unknown): boolean; // sabe reconhecer "acabou o crédito"
}
```

O `ai-router` faz:

```ts
async function run(task: Task, employee: Employee) {
  let providerId = employee.preferredProvider;

  try {
    return await providers[providerId].send(task.messages, employee.systemPrompt);
  } catch (err) {
    if (providers[providerId].isQuotaError(err) && employee.fallbackProvider) {
      // NÃO troca automaticamente — sinaliza para a UI perguntar
      return { needsFallback: true, from: providerId, to: employee.fallbackProvider };
    }
    throw err;
  }
}
```

A UI recebe `needsFallback` e mostra o modal. Se você confirmar, o roteador reenvia **o mesmo histórico** (`task.messages`) para o provedor de fallback — como os dois falam o mesmo formato normalizado, o contexto é preservado.

## Estratégia de troca

Começar com o modo mais simples e confiável:

- **v1 — troca entre tarefas.** Se o Claude esgotou, a próxima tarefa (ou a retomada desta) usa o ChatGPT. Simples, previsível.
- **v2 — troca no meio da mesma tarefa.** Reenvia todo o histórico ao novo provedor. Mais complexo; pode gerar leve inconsistência de estilo entre as respostas. Fica para depois.

## Contagem de tokens e custo

Cada resposta retorna `tokensIn`, `tokensOut` e `costUsd`. Isso alimenta:

- A **barra de status** (tokens/custo da sessão atual).
- A tabela `usage` (dashboard de custo por provedor).

Assim você vê em tempo real quanto cada IA está consumindo e antecipa o esgotamento.

## O modal de fallback

Conteúdo sugerido:

> **Créditos do Claude acabaram**
> Deseja continuar esta tarefa com o ChatGPT?
> Claude: 0 tokens restantes · ChatGPT: ~120k tokens restantes
> [ Continuar com ChatGPT ]  [ Pausar tarefa ]

Mostrar os tokens restantes de cada provedor ajuda a decidir com consciência.
