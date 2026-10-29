use grep_matcher::Matcher;
use grep_regex::RegexMatcherBuilder;
use grep_searcher::sinks::UTF8;
use grep_searcher::{BinaryDetection, SearcherBuilder};
use ignore::{WalkBuilder, WalkState};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

const MAX_FILES: usize = 50_000;
const MAX_MATCHES: usize = 5_000;
const MAX_PREVIEW: usize = 300;

/// Walks `root` like ripgrep does: honors .gitignore, shows dotfiles, skips .git
fn walker(root: &str) -> WalkBuilder {
    let mut b = WalkBuilder::new(root);
    b.hidden(false)
        .require_git(false)
        .filter_entry(|e| e.file_name() != ".git");
    b
}

fn relative(root: &str, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned()
}

#[tauri::command]
pub async fn list_files(root: String) -> Result<Vec<String>, String> {
    let mut files: Vec<String> = walker(&root)
        .build()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_some_and(|t| t.is_file()))
        .take(MAX_FILES)
        .map(|e| relative(&root, e.path()))
        .collect();
    files.sort();
    Ok(files)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    case_sensitive: bool,
    regex: bool,
    whole_word: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    line: u64,
    text: String,
    /// UTF-16 offsets into `text`, so they map directly onto JS strings and Monaco columns
    start: usize,
    end: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    path: String,
    relative: String,
    matches: Vec<LineMatch>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    files: Vec<FileMatches>,
    truncated: bool,
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

fn to_line_match(line_number: u64, line: &str, start: usize, end: usize) -> LineMatch {
    let line = line.trim_end_matches(['\n', '\r']);
    let end = end.min(line.len());
    // Long lines (minified files) get cut to a window around the match
    let from = if line.len() > MAX_PREVIEW && start > 40 {
        line.floor_char_boundary(start - 40)
    } else {
        0
    };
    let to = line.ceil_char_boundary((from + MAX_PREVIEW).max(end).min(line.len()));
    let text = &line[from..to];
    LineMatch {
        line: line_number,
        start: utf16_len(&line[from..start]),
        end: utf16_len(&line[from..end]),
        text: text.to_owned(),
    }
}

#[tauri::command]
pub async fn search(root: String, query: String, options: SearchOptions) -> Result<SearchResult, String> {
    if query.is_empty() {
        return Ok(SearchResult { files: vec![], truncated: false });
    }
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(!options.case_sensitive)
        .fixed_strings(!options.regex)
        .word(options.whole_word)
        .build(&query)
        .map_err(|e| e.to_string())?;

    let results = Mutex::new(Vec::<FileMatches>::new());
    let total = AtomicUsize::new(0);

    walker(&root).build_parallel().run(|| {
        let matcher = matcher.clone();
        let mut searcher = SearcherBuilder::new()
            .binary_detection(BinaryDetection::quit(b'\x00'))
            .line_number(true)
            .build();
        let (root, results, total) = (&root, &results, &total);
        Box::new(move |entry| {
            if total.load(Ordering::Relaxed) >= MAX_MATCHES {
                return WalkState::Quit;
            }
            let Ok(entry) = entry else { return WalkState::Continue };
            if !entry.file_type().is_some_and(|t| t.is_file()) {
                return WalkState::Continue;
            }
            let mut matches = Vec::new();
            let _ = searcher.search_path(
                &matcher,
                entry.path(),
                UTF8(|line_number, line| {
                    if let Ok(Some(m)) = matcher.find(line.as_bytes()) {
                        matches.push(to_line_match(line_number, line, m.start(), m.end()));
                    }
                    Ok(total.fetch_add(1, Ordering::Relaxed) + 1 < MAX_MATCHES)
                }),
            );
            if !matches.is_empty() {
                results.lock().unwrap().push(FileMatches {
                    path: entry.path().to_string_lossy().into_owned(),
                    relative: relative(root, entry.path()),
                    matches,
                });
            }
            WalkState::Continue
        })
    });

    let mut files = results.into_inner().unwrap();
    files.sort_by(|a, b| a.relative.cmp(&b.relative));
    Ok(SearchResult {
        files,
        truncated: total.load(Ordering::Relaxed) >= MAX_MATCHES,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn match_offsets_are_utf16() {
        // "ğ" is 2 bytes in UTF-8 but 1 UTF-16 unit
        let m = to_line_match(1, "ağaç foo\n", 7, 10);
        assert_eq!(m.text, "ağaç foo");
        assert_eq!((m.start, m.end), (5, 8));
    }

    #[test]
    fn long_lines_are_windowed_around_match() {
        let line = format!("{}needle{}", "x".repeat(1000), "y".repeat(1000));
        let m = to_line_match(1, &line, 1000, 1006);
        assert!(m.text.len() <= MAX_PREVIEW + 10);
        assert_eq!(&m.text[m.start..m.end], "needle");
    }

    #[test]
    fn finds_matches_and_respects_gitignore() {
        tauri::async_runtime::block_on(finds_matches_and_respects_gitignore_async());
    }

    async fn finds_matches_and_respects_gitignore_async() {
        let dir = std::env::temp_dir().join(format!("kite-search-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("ignored")).unwrap();
        std::fs::write(dir.join(".gitignore"), "ignored/\n").unwrap();
        std::fs::write(dir.join("a.txt"), "hello World\nnothing\nworld again\n").unwrap();
        std::fs::write(dir.join("ignored/b.txt"), "world\n").unwrap();
        let root = dir.to_string_lossy().into_owned();

        let opts = SearchOptions { case_sensitive: false, regex: false, whole_word: false };
        let r = search(root.clone(), "world".into(), opts).await.unwrap();
        assert_eq!(r.files.len(), 1);
        assert_eq!(r.files[0].relative, "a.txt");
        assert_eq!(r.files[0].matches.iter().map(|m| m.line).collect::<Vec<_>>(), vec![1, 3]);

        let files = list_files(root).await.unwrap();
        assert_eq!(files, vec![".gitignore", "a.txt"]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
