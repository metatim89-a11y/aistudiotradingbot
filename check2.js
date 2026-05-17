import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf-8');
const weird = [];
for (let i = 0; i < html.length; i++) {
  if (html.charCodeAt(i) > 127) {
    const context = html.slice(Math.max(0, i-20), Math.min(html.length, i+20));
    weird.push({ char: html[i], code: html.charCodeAt(i), index: i, context });
  }
}
console.log(weird);
