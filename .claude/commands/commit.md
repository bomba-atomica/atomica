---
description: Create a comprehensive git commit with detailed changelog
---

Create a git commit with all relevant changes and a detailed changelog.

🚨 CRITICAL CONSTRAINTS - THESE MUST BE FOLLOWED:
- NEVER run `git push` or push to remote repository under any circumstances
- NEVER add "Co-Authored-By: Claude" or "Generated with Claude Code" to commit message
- ONLY analyze changes since the last commit - ignore issues from previous commits

WORKFLOW:
1. Run `git status` and `git diff` (staged and unstaged) to see all changes
2. Run `git log -1 --oneline` to see what the last commit was
3. Add relevant untracked files: `git add <file>` (skip build artifacts, node_modules, target/, etc)
4. Stage all modified files: `git add -u`
5. Analyze ALL changes to create detailed changelog
6. Commit with comprehensive message:
   ```
   Brief summary in imperative mood (<70 chars)

   Detailed changelog grouped by category:

   Backend:
   - Specific change with file/component reference
   - Another backend change

   Frontend:
   - UI change description
   - Component modification

   Fixes:
   - Bug fix description
   ```
7. Verify with `git log -1`

STOP after committing. Do NOT push.
