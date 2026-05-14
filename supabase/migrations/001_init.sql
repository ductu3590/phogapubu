-- MEVO — Database Init Migration
-- Chạy file này trong Supabase Dashboard → SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STORES — Quán ăn
-- ============================================================
CREATE TABLE stores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,           -- URL-friendly: 'pho-ga-pubu'
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  zalopay_app_id TEXT,                 -- ZaloPay merchant app_id
  zalopay_key1 TEXT,                   -- ZaloPay key (lưu mã hoá ở production)
  zalopay_key2 TEXT,
  zalo_oa_id TEXT,                     -- Zalo OA để gửi ZNS
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLES — Bàn ăn
-- ============================================================
CREATE TABLE tables (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,          -- 'Bàn 1', 'Bàn VIP A'
  is_active BOOLEAN DEFAULT true
);

-- ============================================================
-- MENU CATEGORIES — Danh mục món
-- ============================================================
CREATE TABLE menu_categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- 'Món chính', 'Đồ uống'
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- ============================================================
-- MENU ITEMS — Món ăn
-- ============================================================
CREATE TABLE menu_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id UUID REFERENCES menu_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL,                  -- VNĐ, không dùng decimal
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORDERS — Đơn hàng
-- ============================================================
CREATE TABLE orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  table_id UUID NOT NULL REFERENCES tables(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cooking','ready','paid','cancelled')),
  total_amount INT NOT NULL DEFAULT 0,
  zalopay_trans_id TEXT,               -- ID giao dịch ZaloPay sau khi thanh toán
  zalo_user_id TEXT,                   -- Zalo User ID để gửi ZNS
  note TEXT,
  payment_method TEXT DEFAULT 'zalopay'
    CHECK (payment_method IN ('zalopay','cash')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORDER ITEMS — Chi tiết đơn (snapshot tên + giá lúc order)
-- ============================================================
CREATE TABLE order_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id),
  item_name TEXT NOT NULL,             -- Snapshot tên lúc order
  item_price INT NOT NULL,             -- Snapshot giá lúc order
  quantity INT NOT NULL DEFAULT 1,
  note TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Khách đọc public data (chỉ quán đang hoạt động)
CREATE POLICY "public_read_stores"
  ON stores FOR SELECT USING (is_active = true);

CREATE POLICY "public_read_tables"
  ON tables FOR SELECT USING (is_active = true);

CREATE POLICY "public_read_categories"
  ON menu_categories FOR SELECT USING (is_active = true);

CREATE POLICY "public_read_items"
  ON menu_items FOR SELECT USING (true);

-- Khách tạo và xem đơn hàng của mình
CREATE POLICY "public_create_orders"
  ON orders FOR INSERT WITH CHECK (true);

CREATE POLICY "public_read_orders"
  ON orders FOR SELECT USING (true);

CREATE POLICY "public_update_orders"
  ON orders FOR UPDATE USING (true);

CREATE POLICY "public_create_order_items"
  ON order_items FOR INSERT WITH CHECK (true);

CREATE POLICY "public_read_order_items"
  ON order_items FOR SELECT USING (true);

-- ============================================================
-- REALTIME — Bật realtime cho bảng orders
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- ============================================================
-- TRIGGER — Tự động cập nhật updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DATA — Phở Gà Pubu (quán pilot)
-- ============================================================
DO $$
DECLARE
  s_id UUID;
  cat_main_id UUID;
  cat_drink_id UUID;
BEGIN
  -- Tạo quán
  INSERT INTO stores (name, slug, phone, address)
  VALUES ('Phở Gà Pubu', 'pho-ga-pubu', '0900000000', 'Lào Cai, Việt Nam')
  RETURNING id INTO s_id;

  -- Tạo 10 bàn
  FOR i IN 1..10 LOOP
    INSERT INTO tables (store_id, table_number)
    VALUES (s_id, 'Bàn ' || i);
  END LOOP;

  -- Tạo danh mục Món chính
  INSERT INTO menu_categories (store_id, name, sort_order)
  VALUES (s_id, 'Món chính', 1)
  RETURNING id INTO cat_main_id;

  INSERT INTO menu_items (store_id, category_id, name, price, sort_order) VALUES
    (s_id, cat_main_id, 'Phở gà', 65000, 1),
    (s_id, cat_main_id, 'Phở gà đặc biệt', 80000, 2),
    (s_id, cat_main_id, 'Phở gà tái lăn', 75000, 3);

  -- Tạo danh mục Đồ uống
  INSERT INTO menu_categories (store_id, name, sort_order)
  VALUES (s_id, 'Đồ uống', 2)
  RETURNING id INTO cat_drink_id;

  INSERT INTO menu_items (store_id, category_id, name, price, sort_order) VALUES
    (s_id, cat_drink_id, 'Nước lọc', 10000, 1),
    (s_id, cat_drink_id, 'Nước cam tươi', 25000, 2),
    (s_id, cat_drink_id, 'Trà đá', 5000, 3);
END $$;
