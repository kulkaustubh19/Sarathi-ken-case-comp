const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.join(require('node:os').tmpdir(), `sarathi-hybrid-${randomUUID()}`);
process.env.NODE_ENV = 'test'; process.env.HEALTHNEST_LOCAL_DATA_DIR = root;
process.env.SUPABASE_URL = 'https://supabase.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request,...args) { return resolve.call(this, request.startsWith('@/') ? path.join(process.cwd(),'src',request.slice(2)) : request,...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(require('node:fs').readFileSync(filename,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
async function main() {
  const docs = require('../src/lib/server/document-service.ts');
  const local = require('../src/lib/server/local-health-data.ts');
  const drive = require('../src/lib/server/google-drive.ts');
  const calendar = require('../src/lib/server/google-calendar.ts');
  const user = { id: randomUUID(), user_name: 'Demo Person', email: 'demo@example.com', mobile_number: '+919876543210' };
  const form = new FormData(); form.set('file', new File(['sample report'], 'report.txt', { type:'text/plain' }));
  for (const [key,value] of Object.entries({storage:'drive', document_type:'Medical Report', patient_choice:'me',doctor_name:'Demo Doctor',document_date:'2026-10-05',city:''})) form.set(key,value);
  await assert.rejects(() => docs.uploadDocument(user,form), /authorization expired/);
  assert.equal((await local.localDocuments(user.id)).length,4, 'no failed Drive upload saved locally');
  drive.setTestDriveSession(user.id,'test-access',true);
  let inserted = 0, uploaded = 0, failCalendar = false, remoteId;
  const originalFetch = global.fetch;
  global.fetch = async (url, init={}) => {
    const target = String(url);
    if (target.startsWith('https://supabase.invalid/')) return Response.json([{user_id:user.id,repository_folder_id:'repo-root', google_email:'demo@example.com'}]);
    if (target.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
      const q = new URL(target).searchParams.get('q');
      if (q.includes('mimeType')) return Response.json({files:[{id:'folder'}]});
      return Response.json({files:[{id:'drive-report',name:'report.txt',mimeType:'text/plain',size:'13',createdTime:'2026-10-05T09:00:00Z', appProperties:{patient_name:'Demo Person',document_type:'Medical Report',doctor_name:'Demo Doctor',document_date:'2026-10-05'}}]});
    }
    if (target.includes('uploadType=resumable')) return new Response(null,{status:200, headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=fake'}});
    if (target.includes('upload_id=fake')) { uploaded++; assert.equal(Buffer.from(init.body).toString(),'sample report'); return Response.json({id:'drive-report'}); }
    if (target.includes('/calendar/v3/')) {
      if (failCalendar) return Response.json({error:'denied'},{status:403});
      if (init.method === 'POST') { inserted++; remoteId=JSON.parse(init.body).id; return inserted === 1 ? Response.json({id:remoteId, htmlLink:'https://www.google.com/calendar/event?eid=demo'}) : Response.json({error:'already exists'},{status:409}); }
      return Response.json({id:remoteId,htmlLink:'https://www.google.com/calendar/event?eid=demo'});
    }
    throw new Error('Unexpected request: '+target);
  };
  try {
    const result = await docs.uploadDocument(user,form);
    assert.equal(result.storage,'drive'); assert.equal(uploaded,1); assert.equal(result.calendar_event.synced,true);
    assert.equal((await local.localDocuments(user.id)).length,4,'Drive bytes and metadata must not enter local document store');
    const scanned = await docs.documentSummary(user,'drive'); assert.equal(scanned.documents.length,1); assert.equal(scanned.summary[0].counts['Medical Report'],1);
    const saved = (await local.localEvents(user.id)).find(e=>e.id === result.calendar_event.id);
    await calendar.syncGoogleEvent(user.id,saved); assert.equal(inserted,1,'synced event not inserted again');
    const stale = {...saved, calendar_status:undefined}; await calendar.syncGoogleEvent(user.id,stale); assert.equal(inserted,2,'409 recovers the same remote event');
    const next = await local.addLocalEvent(user.id,{title:'Blood test',description:'Demo',starts_at:'2026-10-06T04:00:00Z'});
    failCalendar = true; const failed = await calendar.syncGoogleEvent(user.id,next); assert.equal(failed.synced,false);
    assert.ok((await local.localEvents(user.id)).some(e=>e.id === next.id && e.calendar_status === 'failed'),'failed sync preserves local task');
    await assert.rejects(()=>calendar.syncGoogleEvent('another-user',next), /own care tasks/);
    assert.equal(await drive.googleSession('another-user'),null,'Google access belongs only to authorized user');
    const disconnected = await local.addLocalEvent('another-user',{title:'Demo',description:'Local',starts_at:'2026-10-06T04:00:00Z'});
    assert.equal((await calendar.syncGoogleEvent('another-user',disconnected)).synced,false);
    console.log('Google hybrid checks passed: local isolation, Drive upload and live scan, Calendar success/idempotence/failure, owner authorization, and disconnected local tasks.');
  } finally {global.fetch=originalFetch;}
}
main().finally(()=>fs.rm(root,{recursive:true,force:true})).catch(error=>{console.error(error);process.exitCode=1;});
