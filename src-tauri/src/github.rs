// github: chamadas à API do GitHub que dependem apenas do token (sem tocar em disco/Git).
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubUserResponse {
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[tauri::command]
pub async fn github_validate_token(token: String) -> Result<GithubUser, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/user")
        .bearer_auth(&token)
        .header("User-Agent", "DevCrew-App")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|err| format!("Falha ao contatar o GitHub: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Token inválido ou sem permissão (HTTP {})",
            response.status().as_u16()
        ));
    }

    let body: GithubUserResponse = response
        .json()
        .await
        .map_err(|err| format!("Resposta inesperada do GitHub: {err}"))?;

    Ok(GithubUser {
        login: body.login,
        name: body.name,
        avatar_url: body.avatar_url,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
    pub number: i64,
    pub html_url: String,
}

#[derive(Serialize)]
struct CreatePullRequestBody<'a> {
    title: &'a str,
    head: &'a str,
    base: &'a str,
    body: &'a str,
}

#[derive(Deserialize)]
struct CreatePullRequestResponse {
    number: i64,
    html_url: String,
}

/// Extrai `(owner, repo)` de uma URL remota do GitHub — aceita tanto
/// `https://github.com/owner/repo(.git)` quanto `git@github.com:owner/repo(.git)`.
fn parse_owner_repo(remote_url: &str) -> Result<(String, String), String> {
    let cleaned = remote_url.trim().trim_end_matches(".git").trim_end_matches('/');
    let Some(idx) = cleaned.find("github.com") else {
        return Err(format!("URL remota não é do GitHub: {remote_url}"));
    };
    let path = cleaned[idx + "github.com".len()..]
        .trim_start_matches(':')
        .trim_start_matches('/');

    let mut parts = path.splitn(2, '/');
    let owner = parts.next().filter(|part| !part.is_empty());
    let repo = parts.next().filter(|part| !part.is_empty());

    match (owner, repo) {
        (Some(owner), Some(repo)) => Ok((owner.to_string(), repo.to_string())),
        _ => Err(format!("Não foi possível extrair owner/repo de: {remote_url}")),
    }
}

/// Abre um Pull Request real no GitHub. Nunca faz merge — essa API não é chamada por
/// nenhum comando deste app; o merge fica sempre por conta do usuário, direto no GitHub.
#[tauri::command]
pub async fn github_create_pull_request(
    token: String,
    remote_url: String,
    base: String,
    head: String,
    title: String,
    body: String,
) -> Result<PullRequestInfo, String> {
    let (owner, repo) = parse_owner_repo(&remote_url)?;
    let client = reqwest::Client::new();
    let url = format!("https://api.github.com/repos/{owner}/{repo}/pulls");

    let response = client
        .post(&url)
        .bearer_auth(&token)
        .header("User-Agent", "DevCrew-App")
        .header("Accept", "application/vnd.github+json")
        .json(&CreatePullRequestBody {
            title: &title,
            head: &head,
            base: &base,
            body: &body,
        })
        .send()
        .await
        .map_err(|err| format!("Falha ao contatar o GitHub: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Falha ao abrir o Pull Request (HTTP {status}): {text}"));
    }

    let parsed: CreatePullRequestResponse = response
        .json()
        .await
        .map_err(|err| format!("Resposta inesperada do GitHub: {err}"))?;

    Ok(PullRequestInfo {
        number: parsed.number,
        html_url: parsed.html_url,
    })
}

#[derive(Serialize)]
struct CreateReviewBody<'a> {
    body: &'a str,
    event: &'a str,
}

/// Envia um review real num PR (approve ou request changes) — usado pelo QA no loop
/// Dev↔QA (docs/07-colaboracao-e-fluxos.md). O GitHub nem tem uma API de "merge" aqui:
/// review e merge são ações completamente separadas, e este app só chama a de review.
#[tauri::command]
pub async fn github_create_pull_request_review(
    token: String,
    remote_url: String,
    pull_number: i64,
    event: String,
    body: String,
) -> Result<(), String> {
    let (owner, repo) = parse_owner_repo(&remote_url)?;
    let client = reqwest::Client::new();
    let url = format!("https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/reviews");

    let response = client
        .post(&url)
        .bearer_auth(&token)
        .header("User-Agent", "DevCrew-App")
        .header("Accept", "application/vnd.github+json")
        .json(&CreateReviewBody { body: &body, event: &event })
        .send()
        .await
        .map_err(|err| format!("Falha ao contatar o GitHub: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Falha ao enviar o review (HTTP {status}): {text}"));
    }

    Ok(())
}
