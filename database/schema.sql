-- Bảng sản phẩm của SecureMart
CREATE TABLE products (
  -- Khóa chính tự tăng. Số đã cấp sẽ không bao giờ được cấp lại,
  -- khác với cách "max + 1" trong mảng RAM.
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Tên: bắt buộc, không rỗng sau khi cắt khoảng trắng, tối đa 100 ký tự
  name       TEXT NOT NULL
             CHECK (length(btrim(name)) > 0 AND length(name) <= 100),

  -- Giá: NUMERIC dùng cho tiền (chính xác), không dùng số thực dấu phẩy động
  price      NUMERIC(12, 2) NOT NULL CHECK (price >= 0),

  -- Tồn kho: số nguyên không âm
  stock      INTEGER NOT NULL CHECK (stock >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);