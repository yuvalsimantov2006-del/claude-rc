import http from 'node:http';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url));
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(html);}).listen(5173,'0.0.0.0',()=>console.log('Ofek: http://localhost:5173'));
