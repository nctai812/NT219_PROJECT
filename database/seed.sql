-- CHỈ DÙNG KHI PHÁT TRIỂN: xóa sạch và nạp lại 3 sản phẩm mẫu
TRUNCATE products RESTART IDENTITY;

INSERT INTO products (name, price, stock)
VALUES ('Keyboard', 850000, 10),
       ('Gaming Mouse', 450000, 20),
       ('USB-C Hub', 320000, 15);