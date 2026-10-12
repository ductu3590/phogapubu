// Chạy từ gốc repo; tạo WebP và upload đường dẫn mới, không sửa dữ liệu menu.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(require.resolve('sharp', { paths: [path.resolve('admin-web')] }));
const { createClient } = require(require.resolve('@supabase/supabase-js', { paths: [path.resolve('admin-web')] }));
const dir = __dirname;
const env = Object.fromEntries(fs.readFileSync('admin-web/.env.local', 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).map(l => { const i=l.indexOf('='); return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; }));
const storeId = '2139c162-9677-4cbd-87e3-d2e1ac22e6e8';
async function main() {
  if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== 'dlkgdpexjtyynbotkwka.supabase.co') throw new Error('Sai project');
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
  const rows=JSON.parse(fs.readFileSync(path.join(dir,'source-manifest.json'),'utf8'));
  const output=[];
  for (const row of rows) {
    const filename=row.slug+'.webp';
    await sharp(row.source).resize(1024,1024,{fit:'inside'}).webp({quality:88}).toFile(path.join(dir,filename));
    const bytes=fs.readFileSync(path.join(dir,filename));
    const storagePath=storeId+'/weekly-2026-10-05/'+filename;
    const {error}=await client.storage.from('menu-images').upload(storagePath,bytes,{contentType:'image/webp',upsert:false});
    if(error) throw error;
    const url=client.storage.from('menu-images').getPublicUrl(storagePath).data.publicUrl;
    const response=await fetch(url);
    if(!response.ok) throw new Error('Ảnh không đọc được: '+response.status);
    const downloaded=Buffer.from(await response.arrayBuffer());
    if(!downloaded.equals(bytes)) throw new Error('Nội dung ảnh không khớp');
    const {source,...rest}=row;
    output.push({...rest,store_id:storeId,file:filename,image_url:url,bytes:bytes.length,width:1024,height:1024,ai_generated:true});
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(output,null,2)+'\n');
    console.log(row.name+': uploaded and verified ('+bytes.length+' bytes)');
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
