import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const exists=path=>existsSync(new URL(path,root));
const read=path=>readFileSync(new URL(path,root),'utf8');

test('the application has no bundled licence enforcement or activation surfaces',()=>{
 for(const path of [
  'src/lib/brandon-license.ts',
  'src/lib/license-manager-client.js',
  'src/lib/license-manager-client.d.ts',
  'src/app/license/page.tsx',
  'src/app/admin/license/page.tsx',
  'src/app/api/license/route.ts',
  'src/app/api/admin/license/route.ts',
  'src/components/license-manager-panel.tsx',
  'src/components/admin-license-monitor.tsx',
  'tests/application-license-contract.test.mjs',
  'standalone-license-module.zip'
 ]) assert.equal(exists(path),false,path+' should not exist');

 const proxy=read('src/proxy.ts');
 assert.match(proxy,/requiresFirstOwnerSetup/);
 assert.match(proxy,/\/setup/);
 assert.doesNotMatch(proxy,/license|licence/i);
 const adminLayout=read('src/app/admin/layout.tsx');
 assert.doesNotMatch(adminLayout,/\/admin\/license|Application licence/i);
 const env=read('.env.example');
 assert.doesNotMatch(env,/BRANDON_RV_LICENSE|BRANDON_RV_VERSION/);
 const setup=read('src/app/api/auth/bootstrap-owner/route.ts');
 const bootstrap=read('supabase/migrations/20261117160000_atomic_first_owner_bootstrap.sql');
 assert.match(bootstrap,/ceo_founder/);
 const removal=read('supabase/migrations/20261116164445_remove_legacy_application_license.sql');
 assert.match(removal,/DROP TABLE IF EXISTS public\.application_license/i);
});
