// git-service (backend Rust): clonar/conectar repositórios, listar sua árvore de arquivos,
// isolar o trabalho de uma tarefa numa branch, e — só com confirmação explícita do usuário
// na UI — commitar e enviar essa branch pro remoto. Nunca dá merge; isso é sempre manual.
use git2::{build::RepoBuilder, BranchType, Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

/// Uma linha do Terminal ao vivo — espelho de I/O real, nunca narração de IA (docs/07).
/// `channel_id` é a aba (funcionário) que deve exibir a linha; quem escolhe o valor é o
/// chamador em TS (normalmente o id do funcionário responsável pela tarefa).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalLineEvent {
    channel_id: String,
    stream: String, // "stdout" | "stderr"
    text: String,
}

fn emit_terminal_line(app: &AppHandle, channel_id: &str, stream: &str, text: &str) {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    let _ = app.emit(
        "terminal:line",
        TerminalLineEvent {
            channel_id: channel_id.to_string(),
            stream: stream.to_string(),
            text: trimmed.to_string(),
        },
    );
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub name: String,
    pub local_path: String,
    pub remote_url: Option<String>,
    pub default_branch: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// Diretório onde repositórios clonados pelo app são salvos: <appData>/repos/projects.
fn projects_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Não foi possível resolver o diretório de dados do app: {err}"))?;
    let dir = base.join("repos").join("projects");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn repo_name_from_url(url: &str) -> String {
    url.trim_end_matches('/')
        .trim_end_matches(".git")
        .rsplit(['/', ':'])
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("repo")
        .to_string()
}

/// Evita sobrescrever uma pasta existente ao clonar dois repos com o mesmo nome.
fn unique_dest(base: &Path, name: &str) -> PathBuf {
    let mut candidate = base.join(name);
    let mut suffix = 1;
    while candidate.exists() {
        suffix += 1;
        candidate = base.join(format!("{name}-{suffix}"));
    }
    candidate
}

/// Nome da branch atualmente com checkout (HEAD). Usado tanto para detectar a branch
/// default de um repo recém-clonado/conectado quanto para validar a branch corrente
/// antes de qualquer escrita em disco.
fn head_shorthand(repo: &Repository) -> String {
    repo.head()
        .ok()
        .and_then(|head| head.shorthand().ok().map(str::to_string))
        .unwrap_or_else(|| "main".to_string())
}

/// Junta `rel_path` a `root` rejeitando qualquer segmento que escape da raiz do repo
/// (`..`, caminho absoluto, prefixo de drive) — funciona mesmo quando o arquivo ainda
/// não existe no disco (por isso não dá para confiar em `canonicalize` aqui).
fn safe_join(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(rel_path);
    let mut result = root.to_path_buf();
    for component in rel.components() {
        match component {
            Component::Normal(part) => result.push(part),
            Component::CurDir => {}
            _ => return Err(format!("Caminho de arquivo inválido: \"{rel_path}\"")),
        }
    }
    Ok(result)
}

fn remote_url(repo: &Repository) -> Option<String> {
    repo.find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().ok().map(str::to_string))
}

fn clone_repo_blocking(url: &str, dest: &Path, token: Option<String>) -> Result<RepoInfo, String> {
    let mut fetch_options = FetchOptions::new();

    // Só registra credenciais quando há um PAT: repos públicos devem clonar
    // anonimamente, sem acionar negociação de credencial nenhuma.
    if let Some(pat) = token {
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(move |_url, username_from_url, _allowed_types| {
            Cred::userpass_plaintext(username_from_url.unwrap_or("x-access-token"), &pat)
        });
        fetch_options.remote_callbacks(callbacks);
    }

    let repo = RepoBuilder::new()
        .fetch_options(fetch_options)
        .clone(url, dest)
        .map_err(|err| format!("Falha ao clonar o repositório: {err}"))?;

    Ok(RepoInfo {
        name: dest
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "repo".to_string()),
        local_path: dest.to_string_lossy().to_string(),
        remote_url: remote_url(&repo),
        default_branch: head_shorthand(&repo),
    })
}

#[tauri::command]
pub async fn git_clone_repo(
    app: AppHandle,
    url: String,
    token: Option<String>,
) -> Result<RepoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest_dir = projects_dir(&app)?;
        let name = repo_name_from_url(&url);
        let dest = unique_dest(&dest_dir, &name);
        clone_repo_blocking(&url, &dest, token)
    })
    .await
    .map_err(|err| format!("Tarefa de clone cancelada: {err}"))?
}

#[tauri::command]
pub fn git_connect_existing(path: String) -> Result<RepoInfo, String> {
    let repo_path = PathBuf::from(&path);
    let repo = Repository::open(&repo_path)
        .map_err(|err| format!("A pasta selecionada não é um repositório Git: {err}"))?;

    let name = repo_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repo".to_string());

    Ok(RepoInfo {
        name,
        local_path: repo_path.to_string_lossy().to_string(),
        remote_url: remote_url(&repo),
        default_branch: head_shorthand(&repo),
    })
}

/// Lista os itens de um nível do repositório (lazy-load), ignorando `.git` e
/// tudo que o `.gitignore` do repo cobre.
#[tauri::command]
pub fn git_list_dir(repo_path: String, sub_path: Option<String>) -> Result<Vec<TreeEntry>, String> {
    let root = PathBuf::from(&repo_path);
    let repo = Repository::open(&root)
        .map_err(|err| format!("A pasta não é um repositório Git: {err}"))?;

    let target = match sub_path.as_deref() {
        Some(rel) if !rel.is_empty() => root.join(rel),
        _ => root.clone(),
    };

    let canonical_root = root.canonicalize().map_err(|err| err.to_string())?;
    let canonical_target = target.canonicalize().map_err(|err| err.to_string())?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err("Caminho fora do repositório".to_string());
    }

    let read_dir = fs::read_dir(&target).map_err(|err| err.to_string())?;
    let mut entries = Vec::new();

    for item in read_dir {
        let item = item.map_err(|err| err.to_string())?;
        let file_name = item.file_name().to_string_lossy().to_string();
        if file_name == ".git" {
            continue;
        }

        let abs_path = item.path();
        if repo.is_path_ignored(&abs_path).unwrap_or(false) {
            continue;
        }

        let rel_path = abs_path
            .strip_prefix(&root)
            .unwrap_or(&abs_path)
            .to_string_lossy()
            .replace('\\', "/");
        let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);

        entries.push(TreeEntry {
            name: file_name,
            path: rel_path,
            is_dir,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Lista recursivamente todos os arquivos do repositório (ou de um subcaminho), ignorando
/// `.git` e tudo que o `.gitignore` cobre. Usado pelo task-runner para montar o contexto de
/// uma tarefa; `max_entries` evita percorrer repositórios enormes por inteiro.
#[tauri::command]
pub fn git_list_files_recursive(
    repo_path: String,
    sub_path: Option<String>,
    max_entries: Option<usize>,
) -> Result<Vec<TreeEntry>, String> {
    let root = PathBuf::from(&repo_path);
    let repo = Repository::open(&root)
        .map_err(|err| format!("A pasta não é um repositório Git: {err}"))?;

    let start = match sub_path.as_deref() {
        Some(rel) if !rel.is_empty() => root.join(rel),
        _ => root.clone(),
    };

    let canonical_root = root.canonicalize().map_err(|err| err.to_string())?;
    let canonical_start = start.canonicalize().map_err(|err| err.to_string())?;
    if !canonical_start.starts_with(&canonical_root) {
        return Err("Caminho fora do repositório".to_string());
    }

    let cap = max_entries.unwrap_or(2000);
    let mut entries = Vec::new();
    let mut stack = vec![start];

    while let Some(dir) = stack.pop() {
        if entries.len() >= cap {
            break;
        }

        let read_dir = match fs::read_dir(&dir) {
            Ok(read_dir) => read_dir,
            Err(_) => continue,
        };

        let mut items: Vec<_> = read_dir.filter_map(|entry| entry.ok()).collect();
        items.sort_by_key(|entry| entry.file_name());

        for item in items {
            if entries.len() >= cap {
                break;
            }

            let file_name = item.file_name().to_string_lossy().to_string();
            if file_name == ".git" {
                continue;
            }

            let abs_path = item.path();
            if repo.is_path_ignored(&abs_path).unwrap_or(false) {
                continue;
            }

            let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                stack.push(abs_path);
                continue;
            }

            let rel_path = abs_path
                .strip_prefix(&root)
                .unwrap_or(&abs_path)
                .to_string_lossy()
                .replace('\\', "/");

            entries.push(TreeEntry {
                name: file_name,
                path: rel_path,
                is_dir: false,
            });
        }
    }

    Ok(entries)
}

/// Lê um arquivo do repositório em texto. Retorna `None` (em vez de erro) quando o arquivo
/// ainda não existe, para o diff-engine tratar isso como "arquivo novo" ao montar o diff.
#[tauri::command]
pub fn git_read_file(repo_path: String, file_path: String) -> Result<Option<String>, String> {
    let root = PathBuf::from(&repo_path);
    let target = safe_join(&root, &file_path)?;
    if !target.exists() {
        return Ok(None);
    }
    fs::read_to_string(&target)
        .map(Some)
        .map_err(|err| format!("Falha ao ler \"{file_path}\": {err}"))
}

/// Nome da branch atualmente com checkout no repositório.
#[tauri::command]
pub fn git_current_branch(repo_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|err| format!("A pasta não é um repositório Git: {err}"))?;
    Ok(head_shorthand(&repo))
}

/// Cria (se ainda não existir) e faz checkout de uma branch isolada para uma tarefa.
/// Recusa main/master explicitamente: agentes nunca devem escrever direto nela.
#[tauri::command]
pub fn git_create_task_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let trimmed = branch_name.trim();
    if trimmed.is_empty() || trimmed == "main" || trimmed == "master" {
        return Err("Nome de branch inválido: não pode ser vazio nem main/master.".to_string());
    }

    let repo = Repository::open(&repo_path)
        .map_err(|err| format!("A pasta não é um repositório Git: {err}"))?;

    if repo.find_branch(trimmed, BranchType::Local).is_err() {
        let head_commit = repo
            .head()
            .and_then(|head| head.peel_to_commit())
            .map_err(|err| format!("Não foi possível resolver o HEAD do repositório: {err}"))?;
        repo.branch(trimmed, &head_commit, false)
            .map_err(|err| format!("Falha ao criar a branch \"{trimmed}\": {err}"))?;
    }

    let branch_ref = format!("refs/heads/{trimmed}");
    let obj = repo
        .revparse_single(&branch_ref)
        .map_err(|err| format!("Falha ao resolver a branch \"{trimmed}\": {err}"))?;
    repo.checkout_tree(&obj, None)
        .map_err(|err| format!("Falha ao fazer checkout da branch \"{trimmed}\": {err}"))?;
    repo.set_head(&branch_ref)
        .map_err(|err| format!("Falha ao apontar o HEAD para \"{trimmed}\": {err}"))?;

    Ok(trimmed.to_string())
}

/// Escreve o conteúdo de um arquivo no disco, dentro do repositório. Recusa a escrita se a
/// branch com checkout no momento não for exatamente a branch esperada da tarefa — segunda
/// camada de defesa contra escrever na main, independente do que o chamador em TS decidiu.
#[tauri::command]
pub fn git_write_file(
    repo_path: String,
    branch_name: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let trimmed = branch_name.trim();
    if trimmed.is_empty() || trimmed == "main" || trimmed == "master" {
        return Err("Escrita recusada: branch da tarefa não pode ser vazia nem main/master.".to_string());
    }

    let root = PathBuf::from(&repo_path);
    let repo = Repository::open(&root)
        .map_err(|err| format!("A pasta não é um repositório Git: {err}"))?;

    let current = head_shorthand(&repo);
    if current != trimmed {
        return Err(format!(
            "Escrita recusada: a branch com checkout é \"{current}\", mas a tarefa espera \"{trimmed}\". Recrie a branch da tarefa antes de escrever."
        ));
    }

    let target = safe_join(&root, &file_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::write(&target, content).map_err(|err| format!("Falha ao escrever \"{file_path}\": {err}"))
}

/// Cria um commit contendo só os arquivos passados (as mudanças aprovadas da tarefa), na
/// branch isolada. Recusa se a branch com checkout não for a esperada da tarefa — mesma
/// segunda camada de defesa contra tocar na main que `git_write_file` já aplica.
///
/// Emite `terminal:line` com os mesmos fatos que `git commit` mostraria (arquivos
/// adicionados, branch, hash final) — nenhum resumo gerado por IA, só o que realmente
/// aconteceu (Terminal ao vivo, docs/07).
#[tauri::command]
pub fn git_commit_files(
    app: AppHandle,
    repo_path: String,
    branch_name: String,
    channel_id: String,
    file_paths: Vec<String>,
    message: String,
) -> Result<String, String> {
    let trimmed = branch_name.trim();
    if trimmed.is_empty() || trimmed == "main" || trimmed == "master" {
        return Err("Commit recusado: branch da tarefa não pode ser vazia nem main/master.".to_string());
    }
    if file_paths.is_empty() {
        return Err("Nenhum arquivo aprovado para commitar.".to_string());
    }

    let root = PathBuf::from(&repo_path);
    let repo = Repository::open(&root)
        .map_err(|err| format!("A pasta não é um repositório Git: {err}"))?;

    let current = head_shorthand(&repo);
    if current != trimmed {
        return Err(format!(
            "Commit recusado: a branch com checkout é \"{current}\", mas a tarefa espera \"{trimmed}\"."
        ));
    }

    emit_terminal_line(&app, &channel_id, "stdout", &format!("$ git add {}", file_paths.join(" ")));

    let mut index = repo.index().map_err(|err| err.to_string())?;
    for file_path in &file_paths {
        // Só valida que o caminho não escapa do repo; o índice do git2 quer o caminho relativo.
        safe_join(&root, file_path)?;
        index
            .add_path(Path::new(file_path))
            .map_err(|err| format!("Falha ao adicionar \"{file_path}\" ao commit: {err}"))?;
    }
    index.write().map_err(|err| err.to_string())?;

    let tree_id = index.write_tree().map_err(|err| err.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|err| err.to_string())?;

    let parent_commit = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|err| format!("Não foi possível resolver o HEAD: {err}"))?;

    let signature = repo
        .signature()
        .map_err(|err| format!("Configure user.name/user.email no Git antes de commitar: {err}"))?;

    emit_terminal_line(&app, &channel_id, "stdout", &format!("$ git commit -m \"{message}\""));

    let commit_id = repo
        .commit(Some("HEAD"), &signature, &signature, &message, &tree, &[&parent_commit])
        .map_err(|err| format!("Falha ao criar o commit: {err}"))?;

    emit_terminal_line(
        &app,
        &channel_id,
        "stdout",
        &format!("[{trimmed} {}] {message}", &commit_id.to_string()[..7]),
    );

    Ok(commit_id.to_string())
}

/// Envia a branch isolada da tarefa pro remoto `origin`. Nunca dá push na main/master, e
/// jamais faz merge — isso fica sempre por conta do usuário, direto no GitHub.
///
/// Emite `terminal:line` com o texto que o próprio servidor Git manda durante o push
/// (`sideband_progress`) e o progresso de envio de objetos (`push_transfer_progress`) — é
/// o equivalente real ao stdout/stderr que você veria rodando `git push` no terminal, sem
/// nenhuma IA narrando por cima (Terminal ao vivo, docs/07).
#[tauri::command]
pub async fn git_push_branch(
    app: AppHandle,
    repo_path: String,
    branch_name: String,
    channel_id: String,
    token: Option<String>,
) -> Result<(), String> {
    let trimmed = branch_name.trim().to_string();
    if trimmed.is_empty() || trimmed == "main" || trimmed == "master" {
        return Err("Push recusado: branch da tarefa não pode ser vazia nem main/master.".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|err| format!("A pasta não é um repositório Git: {err}"))?;
        let mut remote = repo
            .find_remote("origin")
            .map_err(|err| format!("Remoto \"origin\" não encontrado: {err}"))?;

        emit_terminal_line(&app, &channel_id, "stdout", &format!("$ git push origin {trimmed}"));

        let mut callbacks = RemoteCallbacks::new();
        if let Some(pat) = token {
            callbacks.credentials(move |_url, username_from_url, _allowed_types| {
                Cred::userpass_plaintext(username_from_url.unwrap_or("x-access-token"), &pat)
            });
        }

        callbacks.sideband_progress({
            let app = app.clone();
            let channel_id = channel_id.clone();
            move |data: &[u8]| {
                if let Ok(text) = std::str::from_utf8(data) {
                    emit_terminal_line(&app, &channel_id, "stderr", text);
                }
                true
            }
        });

        callbacks.push_transfer_progress({
            let app = app.clone();
            let channel_id = channel_id.clone();
            move |current, total, bytes| {
                emit_terminal_line(
                    &app,
                    &channel_id,
                    "stdout",
                    &format!("Enviando objetos: {current}/{total}, {bytes} bytes"),
                );
            }
        });

        let mut push_options = PushOptions::new();
        push_options.remote_callbacks(callbacks);

        let refspec = format!("refs/heads/{trimmed}:refs/heads/{trimmed}");
        let result = remote
            .push(&[refspec.as_str()], Some(&mut push_options))
            .map_err(|err| format!("Falha ao enviar a branch \"{trimmed}\": {err}"));

        match &result {
            Ok(()) => emit_terminal_line(&app, &channel_id, "stdout", "Push concluído."),
            Err(err) => emit_terminal_line(&app, &channel_id, "stderr", err),
        }

        result
    })
    .await
    .map_err(|err| format!("Tarefa de push cancelada: {err}"))?
}
