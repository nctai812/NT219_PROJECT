import Fastify, { type FastifyError } from "fastify";

// Lưu ý: phải có đuôi ".js" dù file nguồn là db.ts (quy tắc của NodeNext)
import { pool } from "./db.js";

const app = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      // Không tự ép kiểu: "100" (chuỗi) sẽ bị từ chối thay vì biến thành số 100
      coerceTypes: false,
      // Không âm thầm xóa trường thừa: trường lạ sẽ bị từ chối bằng lỗi 400
      removeAdditional: false,
    },
  },
});

// Bộ xử lý lỗi chung: lỗi phía server (5xx) chỉ ghi log, KHÔNG trả chi tiết cho client.
// Lỗi phía client (4xx, như lỗi schema) vẫn giữ nguyên thông báo để người dùng sửa được.
app.setErrorHandler((error: FastifyError, request, reply) => {
  const statusCode = error.statusCode ?? 500;

  if (statusCode >= 500) {
    request.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  }

  return reply.send(error);
});

// Kiểm tra ID dùng chung cho mọi route: trả số nếu hợp lệ, null nếu không.
// 2147483647 là giá trị lớn nhất của INTEGER trong PostgreSQL.
function parseProductId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

app.get("/health", async () => {
  return {
    status: "ok",
    service: "marketplace-api",
    message: "Backend is running",
  };
});

// Kiểm tra API có nói chuyện được với PostgreSQL không
app.get("/health/db", async (_request, reply) => {
  try {
    await pool.query("SELECT 1 AS ok");
    return { status: "ok", database: "connected" };
  } catch (error) {
    // Chi tiết lỗi chỉ ghi vào log phía server, KHÔNG trả cho client
    // (lỗi database có thể lộ địa chỉ, tên user, cấu trúc hệ thống)
    app.log.error(error);
    return reply.code(503).send({ status: "error", database: "unavailable" });
  }
});

// Khi server tắt thì trả hết kết nối về cho database
app.addHook("onClose", async () => {
  await pool.end();
});

app.get("/products", async () => {
  // Câu lệnh cố định, không có dữ liệu từ client nên không cần tham số
  const result = await pool.query(
    "SELECT id, name, price, stock FROM products ORDER BY id",
  );

  return {
    data: result.rows,
    total: result.rows.length,
  };
});

app.get<{ Params: { id: string } }>("/products/:id", async (request, reply) => {
  const id = parseProductId(request.params.id);

  if (id === null) {
    return reply.code(400).send({ error: "Invalid product ID" });
  }

  // $1 là chỗ giữ chỗ: giá trị id đi riêng trong mảng [id], không bị nối vào câu lệnh
  const result = await pool.query(
    "SELECT id, name, price, stock FROM products WHERE id = $1",
    [id],
  );

  // rows[0] là hàng đầu tiên, không có hàng nào thì là undefined
  const product = result.rows[0];

  if (!product) {
    return reply.code(404).send({ error: "Product not found" });
  }

  return { data: product };
});

// Kiểu dữ liệu của body mà client gửi lên (TypeScript chỉ kiểm tra lúc biên dịch)
type CreateProductBody = {
  name: string;
  price: number;
  stock: number;
};

app.post<{ Body: CreateProductBody }>(
  "/products",
  {
    schema: {
      body: {
        type: "object",
        required: ["name", "price", "stock"],
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          // maximum khớp với NUMERIC(12,2): vượt quá thì database báo lỗi
          price: { type: "number", minimum: 0, maximum: 9999999999 },
          // maximum khớp với kiểu INTEGER của PostgreSQL
          stock: { type: "integer", minimum: 0, maximum: 2147483647 },
        },
      },
    },
  },
  async (request, reply) => {
    const { name, price, stock } = request.body;

    // ID do database tự cấp (IDENTITY), RETURNING trả luôn hàng vừa tạo.
    const result = await pool.query(
      "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING id, name, price, stock",
      [name.trim(), price, stock],
    );

    return reply.code(201).send({ data: result.rows[0] });
  },
);
// Mọi trường đều TÙY CHỌN: client gửi trường nào thì ta sửa trường đó
type UpdateProductBody = Partial<CreateProductBody>;

app.patch<{ Params: { id: string }; Body: UpdateProductBody }>(
  "/products/:id",
  {
    schema: {
      body: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          price: { type: "number", minimum: 0, maximum: 9999999999 },
          stock: { type: "integer", minimum: 0, maximum: 2147483647 },
        },
      },
    },
  },
  async (request, reply) => {
    const id = parseProductId(request.params.id);

    if (id === null) {
      return reply.code(400).send({ error: "Invalid product ID" });
    }

    const { name, price, stock } = request.body;

    // Ghép phần SET chỉ từ các trường client có gửi.
    // - Tên cột (name, price, stock) là chuỗi CỐ ĐỊNH do ta viết, không lấy từ client.
    // - Giá trị đi vào mảng values và được tham chiếu bằng $1, $2, ...
    // - Dấu $ trong `$${...}` chỉ ghép SỐ THỨ TỰ placeholder, không chứa dữ liệu client.
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) {
      values.push(name.trim());
      setClauses.push(`name = $${values.length}`);
    }
    if (price !== undefined) {
      values.push(price);
      setClauses.push(`price = $${values.length}`);
    }
    if (stock !== undefined) {
      values.push(stock);
      setClauses.push(`stock = $${values.length}`);
    }

    // id là tham số cuối cùng, dùng cho WHERE
    values.push(id);

    const result = await pool.query(
      `UPDATE products SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING id, name, price, stock`,
      values,
    );

    const product = result.rows[0];

    if (!product) {
      return reply.code(404).send({ error: "Product not found" });
    }

    return { data: product };
  },
);

app.delete<{ Params: { id: string } }>(
  "/products/:id",
  async (request, reply) => {
    const id = parseProductId(request.params.id);

    if (id === null) {
      return reply.code(400).send({ error: "Invalid product ID" });
    }

    // RETURNING id cho biết có hàng nào thật sự bị xóa không
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "Product not found" });
    }

    // 204: thành công, không có nội dung
    return reply.code(204).send();
  },
);

const start = async () => {
  try {
    await app.listen({
      port: 3000,
      host: "0.0.0.0",
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
