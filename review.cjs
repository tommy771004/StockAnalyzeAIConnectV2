const fs = require('fs');
const path = require('path');

function walkSync(dir, filelist = []) {
  if (!fs.existsSync(dir)) return filelist;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const dirFile = path.join(dir, file);
    const dirent = fs.statSync(dirFile);
    if (dirent.isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else {
      if (dirFile.endsWith('.tsx') || dirFile.endsWith('.jsx')) {
        filelist.push(dirFile);
      }
    }
  }
  return filelist;
}

const files = walkSync('./src');
let txt = '';

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  lines.forEach((line, i) => {
    const n = i + 1;
    if (line.includes('transition-all')) {
      findings.push(`${file}:${n} - transition: all → list properties (use 'transition')`);
    }
    if (line.includes('focus:outline-none') && !line.includes('focus:border') && !line.includes('focus:ring') && !line.includes('focus-visible')) {
      findings.push(`${file}:${n} - outline-none without focus-visible replacement`);
    }
    // div with onclick
    if (line.match(/<div[^>]*\b(?:onClick|onPointerDown)[^>]*>/)) {
       findings.push(`${file}:${n} - <div> with click handlers (should be <button>)`);
    }
    // AutoFocus
    if (line.includes('autoFocus') && !line.includes('aria-label')) { // naive check
       findings.push(`${file}:${n} - autoFocus without clear justification`);
    }
    // Ellipsis
    if (line.includes('...') && !line.includes('...props') && !line.match(/\w\.\.\.\w/) && !line.match(/\.\.\.[\w|[]/)) {
       findings.push(`${file}:${n} - "..." → "…"`);
    }
  });

  if (findings.length > 0) {
    txt += `\n## ${file}\n\n` + findings.join('\n') + '\n';
  } else {
    txt += `\n## ${file}\n\n✓ pass\n`;
  }
});

fs.writeFileSync('review.txt', txt);
console.log('wrote review.txt');
