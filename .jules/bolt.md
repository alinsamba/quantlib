## 2024-06-12 - List Rendering Bottleneck from Top-Level Modal State
**Learning:** Placing modal form state (e.g. `issueData`, `newSubject`) at the top level of a component that renders a large list (like `Inventory.tsx`) causes O(N) re-renders on every O(1) keystroke in the modal input fields. This creates severe input lag.
**Action:** Always memoize list/table rendering with `useMemo` and wrap callback handlers passed into list items with `useCallback` when complex components contain both large lists and interactive forms at the same level. Alternatively, separate the modals and their states into child components.

## 2026-07-23 - Unmemoized Inline Table Editing State in StockAudit
**Learning:** Storing row edit state (`itemEdits`) at the root level of `StockAudit.tsx` without memoizing the shelf verification table causes the entire table to re-render and re-calculate summary totals on every keystroke in quantity or notes inputs.
**Action:** Extract inline edit rows into memoized child components (`React.memo`) or use `useMemo` for table row rendering when managing granular cell edit states in large dataset tables.

