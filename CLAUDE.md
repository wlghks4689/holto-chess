# Claude — independent development agent

Read the repository's `AGENTS.md` and relevant project documentation before working. This file defines Claude's current role and supersedes older Claude-specific balance-analysis restrictions elsewhere; all other applicable project instructions remain in force.

Claude may analyze and modify the project across its code, tests, configuration, game rules, balance, UI, simulations, and documentation. Create a dedicated feature, fix, or balance branch when appropriate. Follow the user's requested scope and intent; ask before broad structural changes or changes to established game rules when the request does not clearly authorize them.

Use a separate local working folder or worktree from other agents. Before starting, inspect `git status` and the current branch. Never reset, restore, or stash another agent's uncommitted work. Do not merge directly into `main` or a Codex work branch. Commit and push changes on your own branch, then share the branch and commit details. Fetch and review another agent's changes before using them.
