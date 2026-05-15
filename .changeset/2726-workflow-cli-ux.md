---
'nexus-agents': patch
---

Fix two of three #2726 workflow CLI UX bugs: \`--format=json\` is now respected, and table descriptions get an ellipsis on overflow instead of truncating mid-word.

- **A**: \`nexus-agents workflow list --format=json\` previously parsed the flag but the dispatcher never forwarded it to \`printWorkflowTemplates\`, and the renderer didn't branch on format anyway — so the table form rendered regardless. Both call sites now thread \`format\` through and the renderer emits \`JSON.stringify(templates, null, 2)\` when requested.
- **B**: Table descriptions used \`desc.slice(0, 60)\` and clipped mid-word (\`"Documentation audit workflow that systematically verifies do"\`). Now truncates at 59 chars and adds a single ellipsis so the operator knows there's more — they can use \`--format=json\` to get full text.

The third sub-bug I originally reported (\`workflow run\` only listing one missing input) turned out to be operator error on my part — the \`bug-fix\` template actually has only one required input. Updated the issue.
