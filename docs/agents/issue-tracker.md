# Issue Tracker

Work through `gh`, so issues and labels stay in step. Label meanings live in `.github/labels.yml`.

- **Search First:** `gh issue list --state all --search "<words>"`. Open a new issue only when nothing covers it.
- **Create:** `gh issue create --title "<type>(<scope>): <sentence>" --body-file <file> --assignee AlaskanTuna --label type:<type> --label area:<scope>`. Write the body to a file first, never inline. The title must parse as a conventional commit; `commitlint.config.js` holds the allowed types and scopes.
- **Sub-Issue:** add `--parent <n>` to the create command.
- **Close:** `gh issue close <n>`. Reopen with `gh issue reopen <n>`.
- **Link:** every pull request body names its issue as `Closes #n`.
