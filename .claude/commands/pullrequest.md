---
description: Create or update a pull request with automated checks and fixes
---

Create or update a pull request from the current working branch, with optional automated CI/CD failure resolution.

**Two workflow modes:**
1. **Push mode**: Push new commits → create/update PR → exit (don't wait for CI)
2. **Check mode**: No new commits → check CI status → optionally fix failures with engineer agent

🚨 CRITICAL CONSTRAINTS - THESE MUST BE FOLLOWED:
- NEVER force push to main/master branches
- Maximum 200 words for PR description in bullet points
- When pushing new commits: Do NOT wait for CI checks - exit immediately after push
- When checking existing PR: Use engineer agent (at `.claude/agents/engineer.md`) to fix code-related failures
  - Only resolve CI/CD failures that are code-related (not infrastructure/credentials)

- **PR title format**: Use `[tag] lowercase description` format
  - Tags in brackets: `[feat]`, `[fix]`, `[chore]`, `[docs]`, `[refactor]`, etc.
  - First word after bracket is lowercase
  - Examples: `[feat] add chat interface`, `[fix] resolve authentication bug`, `[chore] update dependencies`
  - NOT: `feat: Add chat interface` or `[feat] Add chat interface`

WORKFLOW:

## 0. Prerequisites check
- Verify GitHub CLI authentication: `gh auth status 2>&1`
- If not authenticated, inform user to run `gh auth login` and wait for them to authenticate
- Only proceed after authentication is confirmed

## 1. Merge from main branch
**IMPORTANT: Always attempt to merge from main before creating/updating PR to ensure branch is up to date**

- Detect the base branch: `git remote show origin | grep "HEAD branch" | cut -d' ' -f5`
- Fetch latest changes: `git fetch origin`
- Attempt merge from base branch: `git merge origin/<base-branch> --no-commit --no-ff`
- Analyze merge result:
  - **If merge succeeds with no conflicts**:
    - Complete the merge: `git commit -m "Merge <base-branch> into <current-branch>"`
    - Continue to step 2
  - **If merge conflicts occur**:
    - Examine commit history to understand changes:
      - View commit graph: `git log --oneline --graph --all --decorate -20`
      - View commits in current branch not in base: `git log <base-branch>..<current-branch> --oneline`
      - View commits in base not in current branch: `git log <current-branch>..<base-branch> --oneline`
      - View conflicting files: `git status` and `git diff <base-branch>...<current-branch> --name-status`
    - For each conflicting file:
      - Read the conflicted file to see merge conflict markers
      - Understand the context: Both branches may have legitimate, separate concerns on the same file
      - Resolution strategy:
        - If changes address different features/concerns: Merge both changes together
        - If changes conflict logically: Analyze commit messages and code intent to determine correct resolution
        - Preserve all functionality unless there's a clear conflict requiring a choice
    - After resolving all conflicts:
      - Mark resolved: `git add <resolved-files>`
      - Complete merge: `git commit -m "Merge <base-branch> into <current-branch>\n\nResolved conflicts in: <list-files>\n\n[Brief explanation of resolution strategy]"`
    - Continue to step 2
  - **If already up to date**:
    - No merge needed, continue to step 2

## 2. Check for unpushed commits and determine workflow path
- Run `git status` to check current branch and uncommitted changes
- If there are uncommitted changes, stop and ask user if they want to commit first
- Check for unpushed commits: `git log origin/$(git branch --show-current)..HEAD --oneline 2>/dev/null || echo "No tracking branch yet"`
- Store result in a variable to determine path:
  - **PATH A (Has unpushed commits)**: If there are unpushed commits OR no tracking branch → Continue to step 3
  - **PATH B (No unpushed commits)**: If no unpushed commits and tracking branch exists → Skip to step 4 (check CI status)

## 3. Push commits and update PR (PATH A only - when there are new commits)
- Push to origin: `git push -u origin HEAD`
- Check if PR exists: `gh pr view --json number,url,title 2>&1`
- If PR exists (JSON output):
  - Parse the JSON to get PR number
  - Generate PR description (see description format below)
  - Update PR with: `gh pr edit <number> --title "<title>" --body "$(cat <<'EOF'\n<description>\nEOF\n)"`
- If PR doesn't exist (error message):
  - Generate PR description (see description format below)
  - Create PR with: `gh pr create --title "<title>" --body "$(cat <<'EOF'\n<description>\nEOF\n)"`
- IMPORTANT: Always use heredoc syntax (shown above) for multiline PR descriptions to preserve formatting
- After pushing new commits: **STOP HERE** - Do NOT wait for CI checks to complete
- Report to user:
  - PR URL
  - "New commits pushed. CI checks will run automatically. Check status later with `gh pr checks`"

### PR Description Format (used in step 3)
When generating PR description (max 200 words, bullet points):
- First, detect the base branch (usually `main` or `master`): `git remote show origin | grep "HEAD branch" | cut -d' ' -f5`
- Analyze commit history: `git log <base-branch>..HEAD --oneline`
- For comprehensive understanding, also review:
  - Detailed commit messages: `git log <base-branch>..HEAD --format="%h %s%n%b"`
  - File changes: `git diff <base-branch>...HEAD --stat`
  - Key file diffs for context (if needed)
- Review commit messages for context
- If available, check conversation history or previous analysis in the session
- Structure the description as:
  ```
  ## What was expected
  - [Bullet points of intended changes/goals]

  ## What was achieved
  - [Bullet points of completed work with specific file references like `file.rs:123-145`]
  - [Include key features, bug fixes, refactorings]
  - [Mention new types, functions, or components added]

  ## Out of scope / Not yet done
  - [Bullet points of items not completed or intentionally excluded]
  - [Future work or known limitations]
  ```
- IMPORTANT: The description should accurately reflect what was actually achieved, not just paraphrase commit messages

## 4. Check GitHub Actions status (PATH B only - when no new commits to push)
**Only execute this step if you reached here from PATH B (no unpushed commits)**

- First check current status: `gh pr checks`
- Analyze the output:
  - If checks show "pending": Report status and STOP - let checks complete naturally
  - If all checks are passing: Report success and STOP
  - If any checks are failing: Continue to step 5
- NOTE: This step only runs when checking status of an already-pushed PR

## 5. Resolve CI/CD failures using engineer agent
When CI checks are failing:

- Identify failing checks from `gh pr checks` output
- Get workflow run details for each failure: `gh run view <run-id> --log-failed`
- Analyze errors to determine if they are code-related:
  - **Code-related**: Linting errors, test failures, build errors, type errors
  - **Infrastructure-related**: Credentials, permissions, timeouts, rate limits

### For code-related failures:
- Present findings to user with specific file/line references
- Ask: "I found CI failures. Should I use the engineer agent to fix them?"
- If approved:
  - Use the Task tool with `subagent_type="engineer"` and provide:
    - Complete error logs from failed checks
    - List of failing tests/checks
    - Request to analyze, fix, test locally, and commit the fixes
  - Example prompt for engineer agent:
    ```
    The following CI checks are failing on PR #X:

    [Include error logs from gh run view]

    Please:
    1. Analyze the failures
    2. Fix the issues
    3. Run local validation (cargo test, cargo clippy, bun lint, etc.)
    4. Commit fixes with message: [fix] resolve CI failures

    Do not push - I will handle that after review.
    ```
  - After engineer agent completes, push the fixes: `git push`
  - Report that fixes were pushed and new CI run will start automatically

### For infrastructure-related failures:
- Report to user with details
- Explain that manual intervention is needed (cannot be fixed with code changes)

## 6. Final report
Provide a clear summary based on which path was taken:

### PATH A (New commits pushed):
- PR URL
- PR title
- Confirmation that commits were pushed
- Message: "CI checks will run automatically. Run `/pullrequest` again to check status after CI completes."

### PATH B (Checking existing PR status):
- PR URL
- PR title
- Overall status (✅ All passing / ⏳ Pending / ❌ Failed)
- List of all checks with their status and timing:
  - Format: `- ✅ Check Name (duration)` or `- ❌ Check Name` or `- ⏳ Check Name`
  - Use ✅ for pass, ❌ for fail, ⏳ for pending
- If all checks pass: "PR is ready for review ✅"
- If checks are pending: "Checks still running, wait for completion"
- If failures exist and were fixed: "Fixes pushed, new CI run will start automatically"
- If failures exist but not fixed: List issues requiring manual intervention

## Tips for success
- **PR title format**: Always use `[tag] lowercase description` - never capitalize the first word after the bracket
  - Common tags: `[feat]` for features, `[fix]` for bug fixes, `[chore]` for maintenance, `[docs]` for documentation, `[refactor]` for code restructuring
- **Two workflow paths**: The command automatically detects if you're pushing new commits or checking an existing PR
  - New commits → Push and exit (don't wait for CI)
  - No new commits → Check CI status and optionally fix failures
- **Authentication**: Always check `gh auth status` first to avoid mid-workflow failures
- **Heredoc syntax**: Use heredoc for PR descriptions to preserve formatting: `--body "$(cat <<'EOF'\n...\nEOF\n)"`
- **Branch detection**: Auto-detect base branch instead of assuming `main`
- **Engineer agent**: Use the engineer agent (not manual fixes) to resolve CI failures - it can analyze, fix, and test locally
- **Don't wait for CI**: When pushing new commits, exit immediately - CI runs asynchronously
- **Comprehensive analysis**: Review actual code changes, not just commit messages, for accurate PR descriptions
