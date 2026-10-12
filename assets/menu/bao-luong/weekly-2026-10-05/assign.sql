do $$ declare n integer; begin
with images(id,url) as (values ('966a651e-4e9a-41eb-8880-2f245a9cc572'::uuid,'https://dlkgdpexjtyynbotkwka.supabase.co/storage/v1/object/public/menu-images/2139c162-9677-4cbd-87e3-d2e1ac22e6e8/weekly-2026-10-05/chan-ga-nuong-te-cay.webp'),
('0c1bf4b8-bb42-4437-bce4-a4eca97eeade'::uuid,'https://dlkgdpexjtyynbotkwka.supabase.co/storage/v1/object/public/menu-images/2139c162-9677-4cbd-87e3-d2e1ac22e6e8/weekly-2026-10-05/ech-xao-mang-cay.webp'),
('bc5a5bb6-88d8-464b-bd6a-be2a10e72cd4'::uuid,'https://dlkgdpexjtyynbotkwka.supabase.co/storage/v1/object/public/menu-images/2139c162-9677-4cbd-87e3-d2e1ac22e6e8/weekly-2026-10-05/ech-xao-la-lot.webp'),
('674f7bb5-d61d-44ad-8cfd-2ec7b0823951'::uuid,'https://dlkgdpexjtyynbotkwka.supabase.co/storage/v1/object/public/menu-images/2139c162-9677-4cbd-87e3-d2e1ac22e6e8/weekly-2026-10-05/me-ngan-xuc-phong-tom.webp'),
('c0877b50-c062-4a11-916e-45a18ecaee44'::uuid,'https://dlkgdpexjtyynbotkwka.supabase.co/storage/v1/object/public/menu-images/2139c162-9677-4cbd-87e3-d2e1ac22e6e8/weekly-2026-10-05/rau-song-top-mo-ca-chua.webp'))
update public.menu_items m set image_url=images.url from images
where m.id=images.id and m.store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8' and m.category_id='1a1ebc94-4480-446c-8d29-c6144ecb3dcb' and m.image_url is null;
get diagnostics n = row_count;
if n <> 5 then raise exception 'Expected 5 unchanged menu rows, got %', n; end if;
end $$;
