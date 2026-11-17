import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('ALIS proxy integration is valid JavaScript for the Next.js middleware compiler',()=>{
 const result=spawnSync(process.execPath,['--check','.alis/proxy-license.js'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout||'ALIS proxy JavaScript failed syntax validation');
});
