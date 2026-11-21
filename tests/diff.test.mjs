import test from "node:test";
import assert from "node:assert/strict";
import { globToRegExp, isExcluded, splitDiff, filterDiff, truncateText } from "../lib/diff.mjs";

test("globToRegExp matches simple glob", () => {
  assert.ok(globToRegExp("*.lock").test("package-lock.json") === false); // *.lock shouldn't match package-lock.json? actually * matches
  // let's test *.min.js
  assert.ok(globToRegExp("*.min.js").test("app.min.js"));
  assert.ok(!globToRegExp("*.min.js").test("app.js"));
});

test("isExcluded uses basename for patterns without slash", () => {
  assert.ok(isExcluded("src/foo.min.js", ["*.min.js"]));
  assert.ok(!isExcluded("src/foo.js", ["*.min.js"]));
});

test("isExcluded uses full path for patterns with slash", () => {
  assert.ok(isExcluded("vendor/lib/x.js", ["vendor/**"]));
  assert.ok(!isExcluded("src/x.js", ["vendor/**"]));
});

test("splitDiff splits by diff --git", () => {
  const diff = "diff --git a/a.js b/a.js\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/b.js b/b.js\n@@ -1 +1 @@\n-x\n+y\n";
  const files = splitDiff(diff);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, "a.js");
  assert.equal(files[1].path, "b.js");
});

test("filterDiff removes excluded files", () => {
  const diff = "diff --git a/package-lock.json b/package-lock.json\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/src/index.js b/src/index.js\n@@ -1 +1 @@\n-x\n+y\n";
  const r = filterDiff(diff, ["package-lock.json"]);
  assert.equal(r.total, 2);
  assert.equal(r.excluded, 1);
  assert.ok(r.text.includes("src/index.js"));
  assert.ok(!r.text.includes("package-lock.json"));
});

test("truncateText truncates long text", () => {
  const r = truncateText("a".repeat(100), 50);
  assert.ok(r.truncated);
  assert.ok(r.text.length <= 80);
  const r2 = truncateText("short", 50);
  assert.ok(!r2.truncated);
  assert.equal(r2.text, "short");
});
