-- Bảng đơn hàng (mỗi đơn gồm một sản phẩm và số lượng, để giữ đơn giản)
-- owner_id lấy từ claim "sub" của JWT, không nhận từ client
CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id   TEXT NOT NULL CHECK (length(btrim(owner_id)) > 0),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
  total      NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_owner ON orders (owner_id);