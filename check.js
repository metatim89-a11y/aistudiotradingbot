import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf-8');
const script = html.split('<script>')[1].split('</script>')[0];
fs.writeFileSync('script.js', script);
