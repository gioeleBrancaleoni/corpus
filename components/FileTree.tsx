"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/tree";

interface Props {
  tree: TreeNode;
  selected: string | null;
  onSelect(path: string): void;
}

export function FileTree({ tree, selected, onSelect }: Props) {
  return (
    <ul role="tree" className="select-none text-[13px]">
      {(tree.children ?? []).map((node) => (
        <TreeItem key={node.path} node={node} depth={0} selected={selected} onSelect={onSelect} />
      ))}
    </ul>
  );
}

const STATUS_TITLES: Record<NonNullable<TreeNode["status"]>, string> = {
  indexed: "Indexed",
  stale: "Changed since last index",
  unindexed: "Not indexed yet",
  unsupported: "Preview only (not indexed)",
};

function TreeItem({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect(path: string): void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const pad = { paddingLeft: `${depth * 14 + 8}px` };

  if (node.type === "dir") {
    return (
      <li role="treeitem" aria-expanded={open} aria-selected={false}>
        <button
          onClick={() => setOpen(!open)}
          style={pad}
          className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left hover:bg-surface"
        >
          <Chevron open={open} />
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open && (
          <ul role="group">
            {(node.children ?? []).map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isSelected = selected === node.path;
  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        onClick={() => onSelect(node.path)}
        style={pad}
        className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left ${
          isSelected ? "bg-surface font-medium" : "hover:bg-surface"
        }`}
      >
        <StatusBadge status={node.status} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function StatusBadge({ status }: { status: TreeNode["status"] }) {
  const cls =
    status === "indexed"
      ? "bg-primary"
      : status === "stale"
        ? "bg-warn"
        : status === "unsupported"
          ? "bg-line"
          : "border border-muted/50 bg-transparent";
  return (
    <span
      title={status ? STATUS_TITLES[status] : undefined}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`}
    />
  );
}
