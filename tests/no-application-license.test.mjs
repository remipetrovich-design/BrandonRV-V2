import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const exists=path=>existsSync(new URL(path,root));
const read=path=>readFileSync(new URL(path,root),'utf8');

test('the application has no bundled licence enforcement or activation surfaces',()=>{
 for(const path of [
  'src/proxy.ts',
  'src/lib/brandon-license.ts',
  'src/lib/license-manager-client.js',
  'src/lib/license-manager-client.d.ts',
  'src/app/license/page.tsx',
  'src/app/admin/license/page.tsx',
  'src/app/api/license/route.ts',
  'src/app/api/admin/license/route.ts',
  'src/components/license-manager-panel.tsx',
  'src/components/admin-license-monitor.tsx',
  'supabase/migrations/20261112090000_application_license.sql',
  'supabase/migrations/20261112100000_application_license_validation_cache.sql',
  'tests/application-license-contract.test.mjs',
  'standalone-license-module.zip'
 ]) assert.equal(exists(path),false,path+' should not exist');

 const adminLayout=read('src/app/admin/layout.tsx');
 assert.doesNotMatch(adminLayout,/\/admin\/license|Application licence/i);
 const env=read('.env.example');
 assert.doesNotMatch(env,/BRANDON_RV_LICENSE|BRANDON_RV_VERSION/);
 const setup=read('src/app/api/auth/bootstrap-owner/route.ts');
 assert.match(setup,/ceo_founder/);
});
