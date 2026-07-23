-- Dados de demonstração mais ricos — só pra o app nascer com telas populadas (Board,
-- Terminal, Dashboard de Custos) em vez de vazias. Caminhos de repositório são fictícios
-- de propósito (mesmo padrão da migração 0002): não apontam pra nada no disco.

INSERT INTO employees (id, name, role, avatar, system_prompt, preferred_provider, fallback_provider, permission, created_at, updated_at) VALUES
  ('emp-orch-carla', 'Carla', 'orchestrator', '🧭', 'Você é a Orquestradora do time. Recebe pedidos de funcionalidade, quebra em tasks objetivas e distribui pro Dev e pro QA.', 'anthropic', 'openai', 'read', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')),
  ('emp-arch-diego', 'Diego', 'architect', '🏛️', 'Você é o Arquiteto do time. Revisa decisões estruturais e aponta riscos antes que virem dívida técnica.', 'anthropic', NULL, 'read', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'));

INSERT INTO team_members (id, team_id, employee_id) VALUES
  ('tm-carla', 'team-core', 'emp-orch-carla'),
  ('tm-diego', 'team-core', 'emp-arch-diego');

INSERT INTO repos (id, name, local_path, remote_url, default_branch, connected_at) VALUES
  ('repo-api-server', 'api-server', 'C:\Users\demo\repos\api-server', 'https://github.com/demo/api-server', 'main', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-25 days'));

INSERT INTO projects (id, name, repo_id, team_id, origin, created_at) VALUES
  ('proj-api-server', 'API Server', 'repo-api-server', 'team-core', 'existing', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-25 days'));

INSERT INTO employee_scopes (id, employee_id, repo_id, path_glob) VALUES
  ('scope-ana-portfolio', 'emp-dev-ana', 'repo-portfolio', '**'),
  ('scope-ana-api', 'emp-dev-ana', 'repo-api-server', 'src/**'),
  ('scope-bruno-portfolio', 'emp-qa-bruno', 'repo-portfolio', '**'),
  ('scope-bruno-api', 'emp-qa-bruno', 'repo-api-server', '**'),
  ('scope-diego-api', 'emp-arch-diego', 'repo-api-server', '**');

-- Tarefas cobrindo cada coluna do kanban (docs/07 e docs/03).
INSERT INTO tasks (id, project_id, employee_id, created_by, title, description, status, branch, pr_number, pr_url, round, max_rounds, cost_cap_usd, cost_used_usd, paused_reason, created_at, updated_at) VALUES
  ('task-1', 'proj-portfolio', 'emp-dev-ana', NULL, 'Adicionar validação de e-mail no cadastro', 'Validar formato de e-mail e recusar domínios descartáveis no formulário de cadastro.', 'pending', NULL, NULL, NULL, 0, 5, 2.0, 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),

  ('task-2', 'proj-api-server', 'emp-dev-ana', 'emp-orch-carla', 'Implementar endpoint de recuperação de senha', 'Parte do pedido "sistema de login completo": endpoint de recuperação de senha por e-mail.', 'running', 'devcrew/task-a1b2c3d4', NULL, NULL, 0, 5, 2.0, 0.18, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hours')),

  ('task-9', 'proj-portfolio', 'emp-arch-diego', 'emp-orch-carla', 'Revisar arquitetura do módulo de pagamentos', 'Avaliar acoplamento entre o módulo de pagamentos e o de notificações antes do Dev começar.', 'running', NULL, NULL, NULL, 0, 5, 2.0, 0.09, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hours')),

  ('task-3', 'proj-portfolio', 'emp-dev-ana', NULL, 'Adicionar rate limiting no login', 'Limitar tentativas de login por IP pra mitigar força bruta.', 'pr_open', 'devcrew/task-b2c3d4e5', 42, 'https://github.com/demo/portfolio/pull/42', 1, 5, 2.0, 0.34, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),

  ('task-4', 'proj-api-server', 'emp-dev-ana', NULL, 'Corrigir validação de e-mail no cadastro', 'QA encontrou caso onde e-mails com "+" eram recusados incorretamente.', 'changes_requested', 'devcrew/task-c3d4e5f6', 17, 'https://github.com/demo/api-server/pull/17', 2, 5, 2.0, 0.61, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),

  ('task-5', 'proj-portfolio', 'emp-qa-bruno', NULL, 'Revisar middleware de autenticação', 'Checar cobertura de teste e casos de borda do middleware novo.', 'qa_approved', 'devcrew/task-d4e5f6a7', 39, 'https://github.com/demo/portfolio/pull/39', 3, 5, 2.0, 0.89, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),

  ('task-6', 'proj-api-server', 'emp-qa-bruno', NULL, 'Padronizar respostas de erro da API', 'Unificar o formato de erro (code/message/details) em todos os endpoints.', 'awaiting_merge', 'devcrew/task-e5f6a7b8', 12, 'https://github.com/demo/api-server/pull/12', 2, 5, 2.0, 0.45, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days')),

  ('task-7', 'proj-portfolio', 'emp-dev-ana', NULL, 'Configurar CI para rodar os testes automaticamente', 'Pipeline básico: lint + testes a cada push.', 'done', 'devcrew/task-f6a7b8c9', 31, 'https://github.com/demo/portfolio/pull/31', 1, 5, 2.0, 0.22, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 days')),

  ('task-8', 'proj-api-server', 'emp-dev-ana', NULL, 'Migrar autenticação para OAuth2', 'Trocar autenticação própria por OAuth2 com provedor externo.', 'paused', 'devcrew/task-a7b8c9d0', NULL, NULL, 4, 5, 1.0, 1.02, 'cost', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours'));

-- Mensagens (eco no Terminal ao vivo, docs/07) — só um recorte, não a conversa inteira.
INSERT INTO messages (id, task_id, role, content, provider, tokens_in, tokens_out, created_at) VALUES
  ('msg-2-user', 'task-2', 'user', 'Parte do pedido "sistema de login completo": endpoint de recuperação de senha por e-mail.', NULL, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 hours')),
  ('msg-2-assistant', 'task-2', 'assistant', '<file path="src/routes/auth/reset-password.ts">
export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email)
  if (!user) return // não revela se o e-mail existe
  const token = await createResetToken(user.id)
  await sendResetEmail(user.email, token)
}
</file>', 'anthropic', 2140, 386, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 hours')),

  ('msg-3-assistant', 'task-3', 'assistant', 'Adicionei rate limiting por IP no endpoint de login (janela de 15min, máx. 5 tentativas) usando um contador em memória com TTL.', 'anthropic', 1876, 240, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),

  ('msg-5-assistant', 'task-5', 'assistant', '<review status="approve"></review>
Cobertura de teste boa, casos de borda (token expirado, header ausente) cobertos. Aprovado.', 'openai', 980, 64, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days'));

-- Diff de exemplo pra tarefa com PR aberto — pra tela de detalhe não ficar vazia.
INSERT INTO proposed_changes (id, task_id, file_path, diff, status, created_at, old_content, new_content) VALUES
  ('pc-3-1', 'task-3', 'src/middleware/rate-limit.ts',
'--- a/src/middleware/rate-limit.ts
+++ b/src/middleware/rate-limit.ts
@@ -1,0 +2,8 @@
+const attempts = new Map<string, { count: number; resetAt: number }>()
+
+export function rateLimitLogin(ip: string): boolean {
+  const now = Date.now()
+  const entry = attempts.get(ip)
+  if (!entry || entry.resetAt < now) {
+    attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 })
+    return true
+  }
+  return entry.count++ < 5
+}
',
  'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), NULL,
  'const attempts = new Map<string, { count: number; resetAt: number }>()

export function rateLimitLogin(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 })
    return true
  }
  return entry.count++ < 5
}
');

-- Uso de IA nos últimos dias, nos dois provedores e nos dois projetos — pro Dashboard de
-- Custos (gasto por provedor / projeto / período) mostrar um gráfico de verdade.
INSERT INTO usage (id, provider, task_id, tokens_in, tokens_out, cost_usd, created_at) VALUES
  ('usage-1',  'anthropic', 'task-7', 3200, 540, 0.0295, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 days')),
  ('usage-2',  'anthropic', 'task-6', 4100, 720, 0.0385, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days')),
  ('usage-3',  'openai',    'task-6', 2600, 410, 0.0139, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days')),
  ('usage-4',  'anthropic', 'task-5', 5200, 980, 0.0505, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),
  ('usage-5',  'openai',    'task-5', 980, 64, 0.0039, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days')),
  ('usage-6',  'anthropic', 'task-4', 6100, 1100, 0.0580, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
  ('usage-7',  'anthropic', 'task-4', 3400, 610, 0.0325, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
  ('usage-8',  'anthropic', 'task-3', 4800, 890, 0.0463, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
  ('usage-9',  'anthropic', 'task-8', 7200, 1300, 0.0685, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),
  ('usage-10', 'openai',    'task-8', 3100, 520, 0.0163, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),
  ('usage-11', 'anthropic', 'task-2', 2140, 386, 0.0203, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 hours')),
  ('usage-12', 'anthropic', 'task-9', 1800, 310, 0.0168, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours')),
  ('usage-13', 'anthropic', NULL, 1200, 240, 0.0120, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days'));
