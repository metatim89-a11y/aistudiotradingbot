import fs from "fs";
const html = fs.readFileSync("index.html", "utf-8");
const fixed = html.replace(/\\`/g, '`').replace(/\\\${/g, '${');
fs.writeFileSync("index.html", fixed);
console.log("Fixed HTML file");
