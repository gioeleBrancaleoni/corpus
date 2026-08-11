import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTree, listSupportedFiles } from "@/lib/tree";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-tree-"));
  fs.mkdirSync(path.join(root, "docs", "deep"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  fs.mkdirSync(path.join(root, ".hidden-dir"));
  fs.mkdirSync(path.join(root, "drafts"));
  fs.writeFileSync(path.join(root, "readme.md"), "hi");
  fs.writeFileSync(path.join(root, "image.png"), "");
  fs.writeFileSync(path.join(root, ".hidden.md"), "");
  fs.writeFileSync(path.join(root, "docs", "a.txt"), "a");
  fs.writeFileSync(path.join(root, "docs", "deep", "b.csv"), "x,y");
  fs.writeFileSync(path.join(root, "node_modules", "pkg", "index.js"), "");
  fs.writeFileSync(path.join(root, "drafts", "wip.md"), "");
  fs.writeFileSync(path.join(root, ".corpusignore"), "# comment\ndrafts\n");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("buildTree", () => {
  it("walks the tree, skipping dotfiles, node_modules and .corpusignore entries", () => {
    const tree = buildTree(root);
    expect(tree.type).toBe("dir");
    const names = (tree.children ?? []).map((c) => c.name);
    expect(names).toEqual(["docs", "image.png", "readme.md"]); // dirs first, alphabetical
    const docs = tree.children!.find((c) => c.name === "docs")!;
    expect(docs.children!.map((c) => c.name)).toEqual(["deep", "a.txt"]);
  });

  it("uses forward-slash relative paths and marks unsupported files", () => {
    const tree = buildTree(root);
    const docs = tree.children!.find((c) => c.name === "docs")!;
    const deep = docs.children!.find((c) => c.name === "deep")!;
    expect(deep.children![0]!.path).toBe("docs/deep/b.csv");
    const png = tree.children!.find((c) => c.name === "image.png")!;
    expect(png.status).toBe("unsupported");
    const md = tree.children!.find((c) => c.name === "readme.md")!;
    expect(md.status).toBe("unindexed");
  });
});

describe("listSupportedFiles", () => {
  it("returns only supported files as relative paths", () => {
    expect(listSupportedFiles(root).sort()).toEqual([
      "docs/a.txt",
      "docs/deep/b.csv",
      "readme.md",
    ]);
  });
});
