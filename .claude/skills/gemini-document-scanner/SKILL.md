---
name: gemini-document-scanner
description: Use when you need to scan, summarize, analyze, or extract information from large documents, PDFs, logs, or any text-heavy files that benefit from a large context window. Also use when the user says "scan this document", "summarize this file with Gemini", or asks to understand lengthy content.
---

# Gemini Document Scanner

Use Gemini CLI's large context window (1M+ tokens) to scan and understand documents that are too large or complex for inline analysis.

## How It Works

Pipe document content to Gemini CLI in headless mode via bash:

```bash
cat <file> | gemini --prompt "<prompt>" --yolo --raw-output -m auto
```

## Command Reference

| Flag                  | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `--prompt "<prompt>"` | Non-interactive headless mode (required)              |
| `--yolo`              | Auto-accept all actions, no confirmation prompts      |
| `--raw-output`        | Unsanitized output, no ANSI stripping overhead        |
| `-m auto`             | Let Gemini auto-select the best model from its lineup |

## Usage Patterns

### Single file scan

```bash
cat document.pdf | gemini --prompt "Summarize the key points" --yolo --raw-output -m auto
```

### Multiple files combined

```bash
cat file1.md file2.md file3.md | gemini --prompt "Compare these documents and list differences" --yolo --raw-output -m auto
```

### Structured extraction

```bash
cat contract.pdf | gemini --prompt "Extract all dates, parties, and obligations as a markdown table" --yolo --raw-output -m auto
```

### Code/config understanding

```bash
cat terraform/*.tf | gemini --prompt "Explain this infrastructure setup" --yolo --raw-output -m auto
```

### With grep pre-filtering

```bash
grep -r "ERROR" logs/ | gemini --prompt "Categorize these errors and suggest root causes" --yolo --raw-output -m auto
```

## Model Selection

- **`auto`** — Let Gemini auto-select the best model from its lineup. Recommended default.
- Override with a specific model (e.g. `-m gemini-2.5-pro`) only if the user explicitly requests it.

## Guidelines

1. Always use `--prompt` — never run Gemini in interactive mode from Claude Code.
2. Always include `--yolo` and `--raw-output` for unblocked headless execution.
3. For very large files, consider piping through `head -n` or extracting relevant sections first to stay within token limits.
4. Set a bash timeout (e.g., `timeout 120`) for large documents to avoid hanging.
5. Present Gemini's output to the user — don't silently consume it. Attribute the analysis to Gemini.
6. Always use `-m auto` unless the user specifies a particular model.

## Common Mistakes

| Mistake                      | Fix                                                        |
| ---------------------------- | ---------------------------------------------------------- |
| Running Gemini interactively | Always use `--prompt` for headless mode                    |
| Missing `--yolo`             | Gemini may block waiting for confirmation                  |
| Missing `--raw-output`       | Output may be sanitized/stripped unexpectedly              |
| Piping binary files directly | Use appropriate tools to convert first (e.g., `pdftotext`) |
| No timeout on huge inputs    | Prefix with `timeout 120` for safety                       |
