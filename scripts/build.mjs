import { cp, mkdir, writeFile } from 'node:fs/promises';
const {API_URL,AWS_REGION,COGNITO_CLIENT_ID}=process.env;
if(!API_URL||!AWS_REGION||!COGNITO_CLIENT_ID)throw new Error('Set API_URL, AWS_REGION and COGNITO_CLIENT_ID from stack outputs before building for AWS.');
await mkdir('dist',{recursive:true});await cp('frontend','dist',{recursive:true});
await writeFile('dist/config.js',`window.APP_CONFIG = ${JSON.stringify({apiUrl:API_URL.replace(/\/$/,''),region:AWS_REGION,clientId:COGNITO_CLIENT_ID,local:false})};\n`);
console.log('Production frontend built in dist/');
