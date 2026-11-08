import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs/promises';

export const adminId='00000000-0000-4000-8000-000000000001';
export const operatorId='00000000-0000-4000-8000-000000000002';
export const inactiveId='00000000-0000-4000-8000-000000000003';
export async function database({through='999'}={}){
 const db=new PGlite({extensions:{pg_trgm,pgcrypto}});
 await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
 CREATE SCHEMA auth; CREATE SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
   SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated;
 -- Metadatos de Storage para probar las políticas. Los archivos se prueban en el adaptador de la API.
 CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(
   id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false,
   file_size_limit bigint, allowed_mime_types text[]
 );
 CREATE TABLE storage.objects(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   bucket_id text NOT NULL REFERENCES storage.buckets(id),
   name text NOT NULL, UNIQUE(bucket_id,name)
 );
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA storage TO anon,authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const name of (await fs.readdir(dir)).filter(name=>name.endsWith('.sql')&&name.slice(0,3)<=through).sort()){
  await db.exec(await fs.readFile(new URL(name,dir),'utf8'));
 }
 for(const [id,email] of [[adminId,'admin@example.invalid'],[operatorId,'operator@example.invalid'],[inactiveId,'inactive@example.invalid']])await db.query('INSERT INTO auth.users VALUES ($1,$2)',[id,email]);
 await db.query("UPDATE public.profiles SET role=CASE WHEN id=$1 THEN 'admin' ELSE 'operator' END,active=(id<>$2)",[adminId,inactiveId]);
 await session(db,adminId);
 return db;
}
export async function session(db,id,role='authenticated'){
 await db.exec('RESET ROLE');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 await db.exec(`SET ROLE ${role==='anon'?'anon':'authenticated'}`);
}
export async function catalog(db,stock=10){
 const code='TEST-'+crypto.randomUUID().slice(0,8);
 const {rows}=await db.query('SELECT public.create_catalog_item($1::jsonb) AS id',[JSON.stringify({product_code:code,sku:code,name:'Prenda de prueba',sale_price:100,cost:50,initial_stock:stock,min_stock:1})]);
 return (await db.query('SELECT id,on_hand,reserved FROM public.variants WHERE product_id=$1',[rows[0].id])).rows[0].id;
}
export async function order(db,variant,overrides={}){
 const d={key:crypto.randomUUID(),buyer:'Comprador ficticio',channel:'directo',mode:'paid',method:'efectivo',minutes:45,lines:JSON.stringify([{variant_id:variant,quantity:1}]),...overrides};
 const {rows}=await db.query('SELECT public.create_order($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) AS id',[d.key,d.buyer,'',null,d.channel,d.mode,d.method,d.minutes,d.lines]);
 return rows[0].id;
}
