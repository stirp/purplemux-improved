import { describe, expect, it } from 'vitest';
import { buildFileDiffString, getDisplayName, parseMultiFileDiff } from '@/lib/parse-git-diff';

describe('parseMultiFileDiff', () => {
  it('preserves binary paths and added, modified and deleted states without text headers', () => {
    const files = parseMultiFileDiff([
      'diff --git a/images/new.png b/images/new.png',
      'new file mode 100644',
      'Binary files /dev/null and b/images/new.png differ',
      'diff --git a/images/changed.png b/images/changed.png',
      'Binary files a/images/changed.png and b/images/changed.png differ',
      'diff --git a/images/deleted.png b/images/deleted.png',
      'deleted file mode 100644',
      'Binary files a/images/deleted.png and /dev/null differ',
    ].join('\n'));
    expect(files.map(getDisplayName)).toEqual(['images/new.png', 'images/changed.png', 'images/deleted.png']);
    expect(files[0]).toMatchObject({ oldName: '/dev/null', newName: 'images/new.png', isNew: true });
    expect(files[1]).toMatchObject({ oldName: 'images/changed.png', newName: 'images/changed.png' });
    expect(files[2]).toMatchObject({ oldName: 'images/deleted.png', newName: '/dev/null', isDeleted: true });
    for (const file of files) {
      expect(file).toMatchObject({ isBinary: true, hunks: [], additions: 0, deletions: 0 });
      expect(buildFileDiffString(file)).toBe('');
    }
  });

  it.each([
    ['a/with space.bin b/with space.bin', 'with space.bin'],
    ['a/folder b/name.bin b/folder b/name.bin', 'folder b/name.bin'],
    ['a/trailing.bin  b/trailing.bin ', 'trailing.bin '],
    ['a/图片.bin b/图片.bin', '图片.bin'],
    [String.raw`"a/\345\233\276\347\211\207.bin" "b/\345\233\276\347\211\207.bin"`, '图片.bin'],
    [String.raw`"a/with\"quote.bin" "b/with\"quote.bin"`, 'with"quote.bin'],
    [String.raw`"a/with\\slash.bin" "b/with\\slash.bin"`, 'with\\slash.bin'],
    [String.raw`"a/line\nand\ttab.bin" "b/line\nand\ttab.bin"`, 'line\nand\ttab.bin'],
  ])('decodes Git header paths: %s', (header, name) => {
    const [file] = parseMultiFileDiff(`diff --git ${header}\nBinary files differ\n`);
    expect(file).toMatchObject({ oldName: name, newName: name, isBinary: true });
    expect(getDisplayName(file)).toBe(name);
  });

  it('uses rename metadata without stripping real a/ and b/ directory names', () => {
    const [file] = parseMultiFileDiff(String.raw`diff --git a/a/old name.bin "b/b/\345\233\276\347\211\207.bin"
similarity index 100%
rename from a/old name.bin
rename to "b/\345\233\276\347\211\207.bin"
`);
    expect(file).toMatchObject({ oldName: 'a/old name.bin', newName: 'b/图片.bin', isRenamed: true });
    expect(getDisplayName(file)).toBe('b/图片.bin');
  });

  it('keeps paths for mode-only changes and detects binary patches', () => {
    const files = parseMultiFileDiff(`diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
diff --git a/picture.png b/picture.png
GIT binary patch
literal 3
KcmZQzWC8#H2LJ>B
`);
    expect(files.map(getDisplayName)).toEqual(['script.sh', 'picture.png']);
    expect(files[1].isBinary).toBe(true);
  });

  it('keeps text headers, hunks and counts while decoding paths', () => {
    const headers = String.raw`--- "a/\345\233\276\347\211\207.txt"
+++ "b/\345\233\276\347\211\207.txt"`;
    const hunks = '@@ -1 +1 @@\n-old\n+new';
    const [file] = parseMultiFileDiff(`diff --git a/fallback.txt b/fallback.txt\n${headers}\n${hunks}`);
    expect(file).toMatchObject({
      oldName: '图片.txt', newName: '图片.txt', additions: 1, deletions: 1, hunks: [hunks], isBinary: false,
    });
    expect(buildFileDiffString(file)).toBe(`${headers}\n${hunks}`);
  });

  it('preserves text additions, deletions and trailing spaces in names', () => {
    const files = parseMultiFileDiff(`diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+added
diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-deleted
diff --git a/trailing.txt  b/trailing.txt${' '}
--- a/trailing.txt \t
+++ b/trailing.txt \t
@@ -1 +1 @@
-before
+after`);
    expect(files[0]).toMatchObject({ oldName: '/dev/null', newName: 'new.txt', isNew: true, additions: 1 });
    expect(files[1]).toMatchObject({ oldName: 'old.txt', newName: '/dev/null', isDeleted: true, deletions: 1 });
    expect(files[2]).toMatchObject({ oldName: 'trailing.txt ', newName: 'trailing.txt ' });
  });

  it('ignores empty input and preserves the fallback for missing path metadata', () => {
    expect(parseMultiFileDiff(' \n')).toEqual([]);
    const [file] = parseMultiFileDiff('diff --git invalid\nBinary files differ');
    expect(getDisplayName(file)).toBe('file');
  });
});
