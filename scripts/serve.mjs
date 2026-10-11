import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
// Serves dist/ like a static host, so the installable app (manifest + service worker) works locally too.
const dist=path.resolve(import.meta.dirname,'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.join(dist,path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/,''));
  const target=file.startsWith(dist)&&fs.existsSync(file)&&fs.statSync(file).isFile()?file:path.join(dist,'index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});
  fs.createReadStream(target).pipe(res);
}).listen(Number(process.env.PORT)||5173,'0.0.0.0',function(){console.log(`Ofek: http://localhost:${this.address().port}`);});
