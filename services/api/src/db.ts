import pg from "pg";

// pg là thư viện CommonJS nên lấy Pool theo cách này khi dùng ES module
const { Pool } = pg;

// Mặc định pg trả NUMERIC (kiểu của cột price) dưới dạng CHUỖI "850000.00".
// Đoạn này đổi về số để API giữ nguyên định dạng cũ. Mã 1700 là mã kiểu NUMERIC.
// Chấp nhận được vì giá tối đa 12 chữ số, nằm trong vùng số an toàn của JavaScript.
pg.types.setTypeParser(1700, (value: string) => Number(value));

// Đọc biến môi trường bắt buộc. Thiếu thì báo lỗi rõ ràng ngay lúc khởi động,
// thay vì để lỗi khó hiểu xuất hiện sau đó.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name} (kiểm tra file .env)`);
  }
  return value;
}

// Pool = nhóm kết nối dùng chung cho toàn bộ ứng dụng
export const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: requireEnv("POSTGRES_USER"),
  password: requireEnv("POSTGRES_PASSWORD"),
  database: requireEnv("POSTGRES_DB"),
  max: 10, // tối đa 10 kết nối cùng lúc
});
