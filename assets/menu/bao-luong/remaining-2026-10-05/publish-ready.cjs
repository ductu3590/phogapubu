const fs=require('node:fs'),path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:[path.resolve('admin-web')]}));
const {createClient}=require(require.resolve('@supabase/supabase-js',{paths:[path.resolve('admin-web')]}));
const dir=__dirname, storeId='2139c162-9677-4cbd-87e3-d2e1ac22e6e8';
const env=Object.fromEntries(fs.readFileSync('admin-web/.env.local','utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
async function main(){
 if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='dlkgdpexjtyynbotkwka.supabase.co')throw Error('Sai project');
 const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const jobs=fs.readdirSync(path.join(dir,'generated')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,'generated',f),'utf8')));
 const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json'),'utf8'));
 const results=[];
 for(const job of jobs){
  const filename=job.slug+'.webp',file=path.join(dir,filename);
  await sharp(job.source).resize(1024,1024,{fit:'inside'}).webp({quality:88}).toFile(file);
  const bytes=fs.readFileSync(file),objectPath=storeId+'/remaining-2026-10-05/'+filename;
  const {error:uploadError}=await client.storage.from('menu-images').upload(objectPath,bytes,{contentType:'image/webp',upsert:false});
  if(uploadError&&!/already exists|duplicate/i.test(uploadError.message))throw uploadError;
  const url=client.storage.from('menu-images').getPublicUrl(objectPath).data.publicUrl;
  const response=await fetch(url);if(!response.ok)throw Error('HTTP '+response.status);
  if(!Buffer.from(await response.arrayBuffer()).equals(bytes))throw Error('File mismatch '+filename);
  for(const id of job.ids){
   const original=before.find(r=>r.id===id);if(!original||original.image_url!==null)throw Error('Invalid original');
   const {data,error}=await client.from('menu_items').update({image_url:url}).eq('id',id).eq('store_id',storeId).eq('category_id',original.category_id).is('image_url',null).select('id,name,price,image_url');
   if(error)throw error;
   if(data.length!==1||data[0].price!==original.price)throw Error('Unexpected row '+id);
   results.push({...data[0],previous_image_url:null,file:filename,bytes:bytes.length,ai_generated:true});
   fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(results,null,2)+'\n');
  }
  console.log('OK '+job.name+' ('+job.ids.length+' rows)');
 }
 const {data,error}=await client.from('menu_items').select('id,name,price,image_url').eq('store_id',storeId);if(error)throw error;
 for(const r of data){const original=before.find(b=>b.id===r.id);if(original&&(original.price!==r.price||original.name!==r.name))throw Error('Menu changed '+r.id);}
 const report={imagesUploaded:jobs.length,rowsUpdated:results.length,total:data.length,withImages:data.filter(r=>r.image_url).length,remaining:data.filter(r=>!r.image_url).map(r=>r.name)};
 fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
