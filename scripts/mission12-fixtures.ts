import { writeFileSync,mkdirSync } from 'node:fs';
import { investmentSyntheticFiles } from '../lib/workpapers/investment-fixture';
async function main(){const target='docs/probant-lots/mission12-fixtures';mkdirSync(target,{recursive:true});for(const [type,file] of Object.entries(investmentSyntheticFiles()))writeFileSync(target+'/'+type+'.csv',await file.text(),'utf8');console.log('Sept packs synthétiques créés dans '+target);}
void main();
