import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';import fs from 'fs';
const f='src/pages/Operations/Issues.vue';const {descriptor:d,errors}=parse(fs.readFileSync(f,'utf8'));compileScript(d,{id:'x'});const t=compileTemplate({source:d.template.content,id:'x',filename:f});console.log(errors.length+t.errors.length,'errors');
