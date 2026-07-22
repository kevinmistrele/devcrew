-- Guarda o conteúdo completo (antes/depois) de cada mudança proposta, não só o diff
-- unificado — é o que o diff-engine escreve em disco quando a mudança é aprovada.
ALTER TABLE proposed_changes ADD COLUMN old_content TEXT;
ALTER TABLE proposed_changes ADD COLUMN new_content TEXT NOT NULL DEFAULT '';
