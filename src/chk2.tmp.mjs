import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';import fs from 'fs';
for (const f of process.argv.slice(2)) { const {descriptor:d,errors}=parse(fs.readFileSync(f,'utf8')); let n=errors.length;
 try{compileScript(d,{id:'x'});}catch(e){console.log(f,'script',e.message);n++}
 const t=compileTemplate({source:d.template.content,id:'x',filename:f});n+=t.errors.length; t.errors.forEach(e=>console.log(f,e.message||e));
 console.log(f,n?'ERRORS':'ok'); }
