import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const patterns = [
  ['AWS access key', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['literal JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/],
  ['AWS secret assignment', /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+]{40}/i]
];
const skip=new Set(['node_modules','.git','.aws-sam','dist','data','.DS_Store']);
let findings=0;
function inspect(text,location){for(const [name,pattern] of patterns){if(pattern.test(text)){console.error(`${location}: possible ${name} (value redacted)`);findings++;}}}
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(skip.has(entry.name)||entry.isSymbolicLink())continue;const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else inspect(await readFile(path,'utf8'),path);}}
await walk('.');
let gitRoot;
try {gitRoot=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();} catch {}
if(gitRoot===process.cwd()) {
  try {inspect(execFileSync('git',['log','--all','-p','--format='],{encoding:'utf8',maxBuffer:100*1024*1024}),'Git history');console.log('Checked available Git patch history.');}
  catch {console.error('History scan could not finish; run a dedicated secret scanner before submission.');process.exitCode=1;}
} else console.log('No project Git repository: no project commit history to inspect.');
console.log(`Pattern scan finished: ${findings} possible secrets. This is a limited check, not proof that no secrets exist.`);
if(findings)process.exitCode=1;
