import type { FastifyInstance } from "fastify";
import { pool } from "./db.js";
import { requireAuth, requireRole } from "./auth.js";

const MAX_INT = 2147483647;

// Danh sách cột trả về: chuỗi cố định, không lấy từ client
const COLUMNS = `id, owner_id AS "ownerId", product_id AS "productId", quantity, total, status`;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && id <= MAX_INT ? id : null;
}

export function registerOrderRoutes(app: FastifyInstance) {
  // Tạo đơn: chủ đơn LẤY TỪ TOKEN, client không có cách nào chỉ định chủ đơn
  app.post<{ Body: { productId: number; quantity: number } }>(
    "/orders",
    {
      onRequest: [requireAuth, requireRole("customer", "admin")],
      schema: {
        body: {
          type: "object",
          required: ["productId", "quantity"],
          additionalProperties: false, // chặn trường lạ như ownerId, total, status
          properties: {
            productId: { type: "integer", minimum: 1, maximum: MAX_INT },
            quantity: { type: "integer", minimum: 1, maximum: 1000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { productId, quantity } = request.body;
      // Tổng tiền tính ở server từ giá trong database, không tin giá từ client
      const result = await pool.query(
        `INSERT INTO orders (owner_id, product_id, quantity, total)
         SELECT $1::text, id, $3::int, price * $3::int FROM products WHERE id = $2::int
         RETURNING ${COLUMNS}`,
        [request.user!.sub, productId, quantity],
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "Product not found" });
      }
      return reply.code(201).send({ data: result.rows[0] });
    },
  );

  // Danh sách đơn: người thường chỉ thấy đơn của mình, admin thấy tất cả
  app.get("/orders", { onRequest: [requireAuth] }, async (request) => {
    const user = request.user!;
    const result =
      user.role === "admin"
        ? await pool.query(`SELECT ${COLUMNS} FROM orders ORDER BY id`)
        : await pool.query(
            `SELECT ${COLUMNS} FROM orders WHERE owner_id = $1 ORDER BY id`,
            [user.sub],
          );
    return { data: result.rows, total: result.rowCount };
  });

  // Xem một đơn: chống BOLA bằng điều kiện owner_id NGAY TRONG câu truy vấn
  app.get<{ Params: { id: string } }>(
    "/orders/:id",
    { onRequest: [requireAuth] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) {
        return reply.code(400).send({ error: "Invalid order ID" });
      }
      const user = request.user!;
      const result =
        user.role === "admin"
          ? await pool.query(`SELECT ${COLUMNS} FROM orders WHERE id = $1`, [
              id,
            ])
          : await pool.query(
              `SELECT ${COLUMNS} FROM orders WHERE id = $1 AND owner_id = $2`,
              [id, user.sub],
            );
      // Không phải chủ đơn thì coi như không tồn tại (404), không tiết lộ đơn có thật hay không
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "Order not found" });
      }
      return { data: result.rows[0] };
    },
  );
}
