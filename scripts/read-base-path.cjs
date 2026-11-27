/**
 * 读取部署用的 basePath（子路径挂载点）。
 * 优先级：
 *   1. <repo>/purplemux.config.json 的 basePath
 *   2. ~/.purplemux/config.json 的 basePath（用户级覆盖）
 *   3. 空字符串 = 部署在域名根路径（默认，行为与历史版本一致）
 * 不做环境变量读取，避免构建/运行时不一致。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function normalizeBasePath(value) {
  if (typeof value !== 'string') return '';
  let s = value.trim();
  if (!s || s === '/') return '';
  if (!s.startsWith('/')) s = `/${s}`;
  return s.replace(/\/+$/, '');
}

function readBasePath(root = process.cwd()) {
  const candidates = [
    path.join(root, 'purplemux.config.json'),
    path.join(os.homedir(), '.purplemux', 'config.json'),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed.basePath === 'string') {
        return normalizeBasePath(parsed.basePath);
      }
    } catch {
      /* 文件不存在或不是合法 JSON：跳过 */
    }
  }
  return '';
}

module.exports = { readBasePath, normalizeBasePath };
