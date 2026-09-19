import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const p=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(p!==root.slice(0,-1)&&!p.startsWith(root)){res.writeHead(403).end();return;}const file=(await stat(p)).isDirectory()?path.join(p,'index.html'):p;res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(file));}catch{res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');}});
server.listen(Number(process.env.MATH_PORT||4195),'127.0.0.1',()=>console.log(`Math Workshop: http://127.0.0.1:${server.address().port}`));
