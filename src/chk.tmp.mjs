import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';import fs from 'fs';
const s=fs.readFileSync('src/pages/Portfolio/Portfolio.vue','utf8');const {descriptor:d}=parse(s);
const r=compileScript(d,{id:'x'});const t=compileTemplate({source:d.template.content,id:'x',filename:'P.vue'});console.log(t.errors.length,'tpl errors');
