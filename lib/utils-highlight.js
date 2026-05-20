/**
 * 代码语法高亮工具
 *
 * 从 utils.js 中提取的语法高亮逻辑，支持多语言基于正则的高亮渲染。
 *
 * @module utils-highlight
 */

/**
 * 语法高亮 — 基于正则，支持多语言
 * @param {string} code - 原始代码字符串
 * @param {string} lang - 语言标识
 * @returns {string} 带高亮 span 的 HTML
 */
export function highlightCode(code, lang) {
  if (!code) return '';

  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const l = (lang || '').toLowerCase();

  const keywordMap = {
    js:          'abstract|arguments|async|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|from|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|super|switch|synchronized|this|throw|throws|transient|true|try|typeof|undefined|var|void|volatile|while|with|yield',
    javascript:  'abstract|arguments|async|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|from|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|super|switch|synchronized|this|throw|throws|transient|true|try|typeof|undefined|var|void|volatile|while|with|yield',
    typescript:  'abstract|arguments|async|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|from|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|string|super|switch|synchronized|this|throw|throws|transient|true|try|type|typeof|undefined|var|void|volatile|while|with|yield|number|any|void|never|unknown|object|symbol|bigint',
    ts:          'abstract|arguments|async|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|from|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|string|super|switch|synchronized|this|throw|throws|transient|true|try|type|typeof|undefined|var|void|volatile|while|with|yield|number|any|void|never|unknown|object|symbol|bigint',
    python:      'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield',
    py:          'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield',
    bash:        'if|then|else|elif|fi|for|while|until|do|done|case|esac|function|return|exit|local|export|source|alias|unalias|cd|echo|printf|read|test|set|unset|shift|trap|getopts|in|select|declare|typeset|readonly|true|false',
    sh:          'if|then|else|elif|fi|for|while|until|do|done|case|esac|function|return|exit|local|export|source|alias|unalias|cd|echo|printf|read|test|set|unset|shift|trap|getopts|in|select|declare|typeset|readonly|true|false',
    css:         'import|charset|media|keyframes|font-face|page|supports|namespace|layer|property|initial|inherit|unset|revert|none|auto|block|inline|flex|grid|absolute|relative|fixed|sticky|static',
    html:        '',
    json:        '',
  };

  const keywords = keywordMap[l] || keywordMap.js;
  const tokens = [];

  if (l !== 'json' && l !== 'html' && l !== 'css') {
    const multiCommentRe = /\/\*[\s\S]*?\*\//g;
    let m;
    while ((m = multiCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
    const singleCommentRe = /(?<![:\w])\/\/[^\n]*/g;
    while ((m = singleCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }
  if (l === 'python' || l === 'py') {
    const pyCommentRe = /#[^\n]*/g;
    let m;
    while ((m = pyCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }
  if (l === 'bash' || l === 'sh') {
    const bashCommentRe = /#[^\n]*/g;
    let m;
    while ((m = bashCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }
  if (l === 'html') {
    const htmlCommentRe = /&lt;!--[\s\S]*?--&gt;/g;
    let m;
    while ((m = htmlCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }
  if (l === 'css') {
    const cssCommentRe = /\/\*[\s\S]*?\*\//g;
    let m;
    while ((m = cssCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }

  const strRe = /(["'`])(?:(?!\1|\\).|\\.)*?\1/g;
  let sm;
  while ((sm = strRe.exec(escaped)) !== null) {
    tokens.push({ start: sm.index, end: sm.index + sm[0].length, type: 'string', text: sm[0] });
  }

  const numRe = /\b(?:0x[\da-fA-F]+|0o[0-7]+|0b[01]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/g;
  let nm;
  while ((nm = numRe.exec(escaped)) !== null) {
    tokens.push({ start: nm.index, end: nm.index + nm[0].length, type: 'number', text: nm[0] });
  }

  if (keywords) {
    const kwRe = new RegExp('\\b(?:' + keywords + ')\\b', 'g');
    let kw;
    while ((kw = kwRe.exec(escaped)) !== null) {
      tokens.push({ start: kw.index, end: kw.index + kw[0].length, type: 'keyword', text: kw[0] });
    }
  }

  const fnRe = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
  let fm;
  while ((fm = fnRe.exec(escaped)) !== null) {
    tokens.push({ start: fm.index, end: fm.index + fm[1].length, type: 'function', text: fm[1] });
  }

  tokens.sort((a, b) => a.start - b.start || b.end - a.end);

  const filtered = [];
  let lastEnd = 0;
  for (const t of tokens) {
    if (t.start >= lastEnd) {
      filtered.push(t);
      lastEnd = t.end;
    }
  }

  let result = '';
  let pos = 0;
  for (const t of filtered) {
    if (t.start > pos) {
      result += escaped.slice(pos, t.start);
    }
    const cls = `hl-${t.type}`;
    result += `<span class="${cls}">${t.text}</span>`;
    pos = t.end;
  }
  if (pos < escaped.length) {
    result += escaped.slice(pos);
  }

  return result;
}
