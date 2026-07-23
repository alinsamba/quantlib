---
name: jules-management
description: Guidelines, workflows, and standards for creating, reading, updating, and maintaining Jules memory files and codebase learnings in the .jules/ directory.
---

# Jules Management Skill

This skill defines standard operating procedures for interacting with **Jules**, the agent memory and learnings system stored in `.jules/`.

---

## 🎯 Purpose of Jules

The `.jules/` directory acts as a persistent knowledge base for agents working on this codebase. It captures:
1. **Architectural & Performance Learnings**: Hard-won lessons about state management, re-render bottlenecks, IPC handling, etc.
2. **Bug Post-Mortems**: Root cause analysis and preventative rules derived from past fixes.
3. **Domain & Security Guidelines**: Critical rules regarding cryptography, database lock states, or UI conventions.

---

## 📖 1. Reading & Applying Jules Memory

Before starting non-trivial tasks (refactoring, optimization, adding features, or debugging):
- Check for existing `.jules/*.md` files (e.g., [bolt.md](file:///c:/Users/Admin/Documents/quantlib/.jules/bolt.md)).
- Review past learnings relevant to the component or module you are editing.
- Ensure your proposed plan adheres to rules and guidelines established in previous Jules entries.

---

## ✍️ 2. Writing & Updating Jules Entries

Whenever you discover a critical takeaway, resolve a performance issue, or identify a recurring anti-pattern:

### File Naming Convention
- `bolt.md`: Frontend UI performance, state placement, memoization, and rendering optimizations.
- `database.md`: Prisma, SQLite schema migrations, IPC handler transactions, and connection management.
- `security.md`: Cryptographic operations, master key handling, vault locking/unlocking, and memory safety.
- `learnings.md`: General architecture, developer environment setup, or multi-component integration lessons.

### Entry Format
Every new entry in a `.jules/*.md` file MUST follow this markdown format:

```markdown
## YYYY-MM-DD - [Short Descriptive Title of Learning]
**Learning:** [Concise explanation of what was discovered, why an issue occurred, or what anti-pattern caused a bug.]
**Action:** [Actionable, specific guidelines to follow in future code changes to prevent recurrence or maintain quality.]
```

### Example Entry
```markdown
## 2026-07-23 - List Rendering Bottleneck from Top-Level Modal State
**Learning:** Placing modal form state (`issueData`, `newSubject`) at the top level of a component that renders a large list (`Inventory.tsx`) causes O(N) re-renders on every O(1) keystroke in modal input fields.
**Action:** Always memoize list/table rendering with `useMemo` and wrap callback handlers passed into list items with `useCallback` when complex components contain both large lists and interactive forms at the same level. Alternatively, separate modals and their states into isolated child components.
```

---

## 🧹 3. Maintenance & Quality Rules

1. **Be Concise & Actionable**: Avoid verbose descriptions. Focus strictly on *Learning* and *Actionable Rule*.
2. **Preserve History**: Append new entries to existing `.jules` files chronologically. Do NOT delete or rewrite existing valid entries unless explicitly refactoring obsolete patterns.
3. **No Sensitive Data**: Never store plain-text passwords, secret keys, or raw personal user data in `.jules` entries.
